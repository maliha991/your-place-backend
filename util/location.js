const axios = require("axios").default;

const HttpError = require("../models/http-error");



async function getCoordsForAddress(address) {
	return {
		lat: 40.7484474,
		lng: -73.9871516,
	};

// 	try {
// 		const response = await axios.get(
// 			`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
// 				address
// 			)}&key=${API_KEY}`
// 		);

// 		const data = response.data;

// 		if (!data || data.status === "ZERO_RESULTS") {
// 			throw new HttpError(
// 				"Could not find location for the specified address.",
// 				422
// 			);
// 		}

// 		console.log(data);

// 		const coordinates = data.results[0].geometry.location;

// 		return coordinates;
// 	} catch (error) {
// 		console.log(error);
// 	}
}

module.exports = getCoordsForAddress;
