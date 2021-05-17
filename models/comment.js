const mongoose = require("mongoose");

const Schema = mongoose.Schema();

const commentSchema = new Schema({
	commentor: { type: mongoose.Types.ObjectId, required: true, ref: "User" },
	post: { type: mongoose.Types.ObjectId, required: true, ref: "Place" },
	comment: { type: String, required: true },
});
