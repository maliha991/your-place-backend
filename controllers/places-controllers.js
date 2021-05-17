const mongoose = require("mongoose");
const fs = require("fs");

const { validationResult } = require("express-validator");

const HttpError = require("../models/http-error");
const getCoordsForAddress = require("../util/location");
const Place = require("../models/place");
const User = require("../models/user");

const getPlaceById = async (req, res, next) => {
	const placeId = req.params.pid;

	let place;

	try {
		place = await Place.findById(placeId);
	} catch (error) {
		return next(
			new HttpError("Something went wrong, could not find a place"),
			500
		);
	}

	if (!place) {
		return next(
			new HttpError("Couldn't find a place for the provided id.", 404)
		);
	}

	res.json({ place: place.toObject({ getters: true }) });
};

const createPlace = async (req, res, next) => {
	const errors = validationResult(req);

	if (!errors.isEmpty()) {
		return next(
			new HttpError("Invalid inputs passed, please check your data.", 422)
		);
	}

	const { title, description, address, creator } = req.body;

	let coordinates;
	try {
		coordinates = await getCoordsForAddress(address);
	} catch (error) {
		console.log("Error: ", error);
		return next(error);
	}

	console.log(coordinates);

	const createdPlace = new Place({
		title,
		description,
		address,
		location: coordinates,
		image: req.file.path,
		creator,
		rating: 0,
	});

	let user;

	try {
		user = await User.findById(creator);
	} catch (error) {
		return next(new HttpError("Creating place failed, please try again.", 500));
	}

	if (!user) {
		return next(new HttpError("Could not find user for the provided id.", 404));
	}

	console.log(user);

	try {
		const session = await mongoose.startSession();
		session.startTransaction();
		await createdPlace.save({ session });
		user.places.push(createdPlace);
		await user.save({ session });
		await session.commitTransaction();
	} catch (error) {
		return next(new HttpError("Creating place failed, please try again.", 500));
	}

	res.status(201).json({ place: createdPlace });
};

const updatePlace = async (req, res, next) => {
	const errors = validationResult(req);

	if (!errors.isEmpty()) {
		console.log(errors);
		throw new HttpError("Invalid inputs passed, please check your data.", 422);
	}

	const { title, description } = req.body;
	const placeId = req.params.pid;

	let place;
	try {
		place = await Place.findById(placeId);
	} catch (error) {
		return next(
			new HttpError("Something went wrong. Could not update the place", 500)
		);
	}

	const imagePath = place.image;

	place.title = title;
	place.description = description;
	if (req.file) {
		place.image = req.file.path;
		fs.unlink(imagePath, (err) => {
			console.log(err);
		});
	}

	try {
		await place.save();
	} catch (error) {
		console.log(error);
		return next(
			new HttpError("Something went wrong, could not update the place"),
			500
		);
	}

	res.status(200).json({ place: place.toObject({ getters: true }) });
};

const deletePlace = async (req, res, next) => {
	const placeId = req.params.pid;

	let place;

	try {
		place = await Place.findById(placeId).populate("creator");
	} catch (error) {
		return next(
			new HttpError("Something went wrong, could not delete the place"),
			500
		);
	}

	if (!place) {
		return next(new HttpError("Could not find place for this id.", 404));
	}

	const imagePath = place.image;

	try {
		const session = await mongoose.startSession();
		session.startTransaction();
		await place.remove({ session });
		place.creator.places.pull(place);
		await place.creator.save({ session });
		await session.commitTransaction();
	} catch (error) {
		return next(
			new HttpError("Something went wrong, could not delete the place"),
			500
		);
	}

	fs.unlink(imagePath, (err) => {
		console.log(err);
	});

	res.status(200).json({ message: "Deleted place." });
};

exports.getPlaceById = getPlaceById;
exports.createPlace = createPlace;
exports.updatePlace = updatePlace;
exports.deletePlace = deletePlace;
