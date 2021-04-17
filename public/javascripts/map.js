// set up leaflet map on a page
let osmUrl = "http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
let osmAttrib = "Map data © <a href=\"http://openstreetmap.org\">OpenStreetMap</a> contributors";
let osmLayer = new L.TileLayer(osmUrl, {minZoom: 3, maxZoom: 19, attribution: osmAttrib});

let mapparino = new L.Map("map");
mapparino.addLayer(osmLayer);

let roads = {};
let body = document.getElementsByTagName("body")[0];

// on startup, draw my route
body.classList.add("is-loading");
fetch(baseUrl + "routes")
	.then((response) => response.json())
	.then((routes) => {
		var home = routes[0]["latlng"].data[0];
		mapparino.setView(new L.LatLng(home[0], home[1]), 14);
		routes.forEach(drawRoute);

		// now get the data from around the starting point of this route
		fetch(baseUrl + "road/" + home[0] + "/" + home[1])
			.then((response) => response.json())
			.then((roads) => {
				roads.forEach(highlightRoad)
				body.classList.remove("is-loading");
			});
	});

// highlight the given road
function highlightRoad(road) {
	if (!road.id.includes("way")) {
		return; // only draw ways
	}
	if (road.visited) {
		return; // only draw visited roads
	}
	if (!road || !road.id) {
		// error while querying road
		console.log(road);

		if (road.message) {
			alert(road.message);
		}

		return;
	}

	if (roads[road.id]) {
		return;
	}

	let roadColor = "#ee0000";

	let points = road.geometry.coordinates;
	let roadLine = L.polyline(points, {
			weight: 10,
			color: roadColor,
			opacity: 0.5
		});
	let roadDescription = `<strong>${road.properties.tags.name || "Unknown road"}</strong><br/>
								<pre>${JSON.stringify(road.properties, null, 2)}</pre>`;

	roadLine
		.bindTooltip(roadDescription, {
			sticky: true
		})
		.addTo(mapparino);



	roadLine.addTo(mapparino);

	roads[road.id] = roadLine;

	// when road is clicked again, deselect it
	roadLine.on("click", function (e) {
		L.DomEvent.stop(e);
		deselectRoad(road.id);
	});
	roadLine.on("mouseover", function(e) {
		this.setStyle({
			color: "green"
		});
	});
	roadLine.on("mouseout", function(e) {
		this.setStyle({
			color: roadColor
		});
	});
}

// location found stuff

// mapparino.on("locationfound", function (e) {
// 	L.marker(e.latlng)
// 		.bindTooltip("you are here", { sticky: true })
// 		.addTo(mapparino);
// });

// mapparino.on("locationerror", function (e) {
// 	alert(e.message);
// });

// mapparino.locate({setView: true, maxZoom: 16});

mapparino.on("click", function (e) {
	var point = [ e.latlng.lat, e.latlng.lng ];
	var streetViewImg = document.getElementById("streetviewimg");
	streetViewImg.src = `${baseUrl}streetview/${point[0]}/${point[1]}`
	// alert(point);
	// pop image up with url of thing
});

function drawRoute(route) {
	let points = route["latlng"].data;
	let roadLine = L.polyline(points, {
		weight: 5,
		color: "#0000ee",
		opacity: 0.75
	});

	roadLine.addTo(mapparino);
}

function deselectRoad(roadId) {
	roads[roadId].remove();
	delete roads[roadId];
}