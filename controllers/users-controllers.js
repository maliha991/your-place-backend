const mongoose = require("mongoose");
const fs = require("fs");

const { check, validationResult } = require("express-validator");
const passwordValidator = require("password-validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const HttpError = require("../models/http-error");
const User = require("../models/user");
const Place = require("../models/place");

const getUsers = async (req, res, next) => {
	let users;
	try {
		users = await User.find({}, "-password");
	} catch (error) {
		return next(
			new HttpError("Fetching users failed, please try again later.", 500)
		);
	}

	res.json({ users: users.map((u) => u.toObject({ getters: true })) });
};

const getProfileByUserId = async (req, res, next) => {
	const userId = req.params.uid;

	let userWithPlaces;
	let user;
	try {
		user = await User.findById(userId);
		userWithPlaces = await User.findById(userId).populate("places");
	} catch (error) {
		return next(
			new HttpError("Fetching profile failed, please try again later.", 500)
		);
	}

	console.log("User: ", user);
	console.log("User with places: ", userWithPlaces);

	if (!user || !userWithPlaces) {
		return next(
			new HttpError("Couldn't find profile for the provided user id.", 404)
		);
	}

	res.json({
		user: user.toObject({ getters: true }),
		places: userWithPlaces.places.map((place) =>
			place.toObject({ getters: true })
		),
	});
};

const updateProfile = async (req, res, next) => {
	const errors = validationResult(req);

	if (!errors.isEmpty()) {
		console.log(errors);
		throw new HttpError("Invalid inputs passed, please check your data.", 422);
	}

	const { name, email, prevPassword, newPassword } = req.body;
	const userId = req.params.uid;

	let updatedProfile;

	try {
		updatedProfile = await User.findById(userId);
	} catch (error) {
		return next(
			new HttpError("Something went wrong, could not update the profile.", 500)
		);
	}

	console.log("Current: ", updatedProfile);

	const imagePath = updatedProfile.image;

	let hashedPassword;
	let isValidPrevPassword;
	const schema = new passwordValidator();
	schema.is().min(6);

	updatedProfile.name = name;
	updatedProfile.email = email;
	if (prevPassword && newPassword) {
		// checking previous password
		try {
			isValidPrevPassword = await bcrypt.compare(
				prevPassword,
				updatedProfile.password
			);
		} catch (err) {
			console.log({ isValidPrevPassword });
			return next(
				new HttpError("Could not update profile, please try again later", 400)
			);
		}

		console.log({ isValidPrevPassword });

		if (!isValidPrevPassword) {
			return next(
				new HttpError(
					"Password didn't match. Please provide correct password.",
					422
				)
			);
		}

		// validating new password and store it in database
		if (schema.validate(newPassword)) {
			try {
				hashedPassword = await bcrypt.hash(newPassword, 12);
			} catch (error) {
				return next(
					new HttpError("Could not update profile, please try again.", 500)
				);
			}
			updatedProfile.password = hashedPassword;
		} else {
			return next(
				new HttpError("Invalid inputs passed. Please check your data", 422)
			);
		}
	}

	if (req.file) {
		updatedProfile.image = req.file.path;
		fs.unlink(imagePath, (err) => {
			console.log(err);
		});
	}

	try {
		await updatedProfile.save();
	} catch (error) {
		console.log(error);
		return next(
			new HttpError("Something went wrong, could not update the profile", 500)
		);
	}

	res
		.status(200)
		.json({ user: updatedProfile.toObject({ getters: true }), updated: true });
};

const deleteProfile = async (req, res, next) => {
	const userId = req.params.uid;

	let profile;

	try {
		profile = await User.findById(userId).populate("places");
		console.log(profile);
	} catch (error) {
		return next(
			new HttpError("Something went wrong, could not delete the profile", 500)
		);
	}

	if (!profile || !profile.places.length === 0) {
		return next(
			new HttpError("Something went wrong, could not delete the profile", 404)
		);
	}

	const imagePath = profile.image;

	try {
		const session = await mongoose.startSession();
		session.startTransaction();
		await profile.remove({ session });
		placeId = profile.places.map((place) => place.creator);
		place = await Place.findById(placeId);
		Place.findOneAndDelete(place, (error) => {
			if (error) {
				console.log("Error: ", error);
				return next(
					new HttpError(
						"Something went wrong, could not delete the profile",
						500
					)
				);
			}
		});
		// await profile.places.save({ session });
		await session.commitTransaction();
	} catch (error) {
		console.log(error);
		return next(
			new HttpError("Something went wrong, could not delete the profile", 500)
		);
	}

	fs.unlink(imagePath, (err) => {
		console.log(err);
	});

	res.status(200).json({ message: "Profile Deleted." });
};

const signup = async (req, res, next) => {
	const errors = validationResult(req);

	if (!errors.isEmpty()) {
		console.log(errors);
		return next(
			new HttpError("Invalid inputs passed, please check your data.", 422)
		);
	}

	const { name, email, password } = req.body;

	let existingUser;
	try {
		existingUser = await User.findOne({ email: email });
	} catch (error) {
		return next(
			new HttpError("Signing up failed, please try again later.", 500)
		);
	}

	if (existingUser) {
		return next(
			new HttpError("User exists already, please login instead.", 422)
		);
	}

	let hashedPassword;
	try {
		hashedPassword = await bcrypt.hash(password, 12);
	} catch (error) {
		return next(new HttpError("Could not create user, please try again."), 500);
	}

	const createdUser = new User({
		name,
		email,
		image: req.file.path,
		password: hashedPassword,
		rating: 0,
		places: [],
	});

	try {
		await createdUser.save();
	} catch (error) {
		return next(
			new HttpError("Signing up failed, please try again later.", 500)
		);
	}

	let token;
	try {
		token = jwt.sign(
			{ userId: createdUser.id, email: createdUser.email },
			"supersecret_dont_share",
			{ expiresIn: "1h" }
		);
	} catch (error) {
		return next(
			new HttpError("Signing up failed, please try again later.", 500)
		);
	}

	res
		.status(201)
		.json({ userId: createdUser.id, email: createdUser.email, token: token });
};

const login = async (req, res, next) => {
	const { email, password } = req.body;

	let existingUser;
	try {
		existingUser = await User.findOne({ email: email });
	} catch (error) {
		return next(
			new HttpError("Logging in failed, please try again later.", 500)
		);
	}

	if (!existingUser) {
		return next(
			new HttpError("Invalid credentials, could not log you in.", 401)
		);
	}

	let isValidPassword = false;
	try {
		isValidPassword = await bcrypt.compare(password, existingUser.password);
	} catch (error) {
		return next(
			new HttpError("Could not log you in. Please try again later.", 500)
		);
	}

	if (!isValidPassword) {
		return next(
			new HttpError("Invalid credentials, could not log you in.", 401)
		);
	}

	let token;
	try {
		token = jwt.sign(
			{ userId: existingUser.id, email: existingUser.email },
			"supersecret_dont_share",
			{ expiresIn: "1h" }
		);
	} catch (error) {
		return next(
			new HttpError("Logging in failed, please try again later.", 500)
		);
	}

	res.json({
		userId: existingUser.id,
		email: existingUser.email,
		token: token,
	});
};

exports.getUsers = getUsers;
exports.getProfileByUserId = getProfileByUserId;
exports.updateProfile = updateProfile;
exports.deleteProfile = deleteProfile;
exports.signup = signup;
exports.login = login;
