# Exploration Mapper
The idea is to map out an area around my house, and see what roads nearby i haven't yet explored on my bike. I've also implemented a streetview thing so you can see stuff with any gopro footage youve recorded during your rides. To use that just put your footage in `cache/videos/examplefootage.mp4`, and it should autodetect/load it when starting up.

# Demo

Heres a demo showing the "streetview" part of this project. This is an example showing how it works with the video and just plain images.

![explorationmapper](docs/explorationmapper.mp4)

# Config / Setup

To setup the config so it works properly, make a config.json file, and put your strava api info in it:
```json
{
	"strava_api": {
		"client_id": "clientidgoeshere",
		"client_secret": "clientsecretgoeshere"
	}
}
```

Then you should be able to just run:
```
npm install
npm start
```

And then connect your browser to localhost:3000 and be good to go!

Note that if you want to use the video stuff, you'll have to install ffmpeg and ffprobe. If running this via docker, set PATH to include the binaries included by the static npm packages that have been added.

# Todo

- [x] Figure out strava api and connections
- [x] Get the initial map up and running
- [x] Get the unexplored-roads up and running
- [x] Implement initial streetview stuff
- [x] Integrate the strava stuff into javascript so python script isnt needed anymore
- [x] Rework a bunch of the server code to use async await stuff properly
- [ ] Clean up the server code to be a lot better structured
- [x] Set it up to work on docker
- [x] Clean up the map and frontend UI
- [x] Make a thing for the strava auth code thing so its much more streamlined
- [x] Add a setup section to the readme so it shows how to start it up
- [x] Make video startable from the streetview preview thing
- [x] Setup a script to auto-grab the video from gopro and then delete
- [ ] Setup a basic auth thing so i can have it be public but still private
