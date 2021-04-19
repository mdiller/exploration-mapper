# Exploration Mapper
The idea is to map out an area around my house, and see what roads nearby i haven't yet explored on my bike. I've also implemented a streetview thing so you can see stuff with any gopro footage youve recorded during your rides. To use that just put your footage in `cache/videos/examplefootage.mp4`, and it should autodetect/load it when starting up.

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

# Todo

- [x] Figure out strava api and connections
- [x] Get the initial map up and running
- [x] Get the unexplored-roads up and running
- [x] Implement initial streetview stuff
- [x] Integrate the strava stuff into javascript so python script isnt needed anymore
- [ ] Clean up the server code to be a lot better structured with proper await/async stuff
- [ ] Set it up to work on docker
- [ ] Clean up the map and frontend UI
- [x] Make a thing for the strava auth code thing so its much more streamlined
- [x] Add a setup section to the readme so it shows how to start it up
- [ ] Make video startable from the streetview preview thing
- [ ] Setup a script to auto-grab the video from gopro and then delete

