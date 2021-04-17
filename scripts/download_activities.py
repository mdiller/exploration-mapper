import requests
import json
import os
import time

# Strava api docs:
# https://developers.strava.com/docs/reference/

# Most of the implementation here was made much easier by this blog post:
# https://medium.com/swlh/using-python-to-connect-to-stravas-api-and-analyse-your-activities-dummies-guide-5f49727aac86


cache_dir = "cache"
tokens_file = cache_dir + "/strava_tokens.json"
with open("config.json", "r") as f:
	config = json.loads(f.read())

if not os.path.exists(cache_dir):
	os.makedirs(cache_dir)

def get_strava_token():
	if os.path.exists(tokens_file):
		with open(tokens_file, "r") as f:
			data = json.loads(f.read())
		if data["expires_at"] > time.time():
			print(f"] using existing token, as it hasn't expired")
			return data["access_token"]
		else:
			print(f"] refreshing an existing (expired) token")
			response = requests.post(
				url = "https://www.strava.com/oauth/token",
				data = {
					"client_id": config["strava_api"]["client_id"],
					"client_secret": config["strava_api"]["client_secret"],
					"grant_type": "refresh_token",
					"refresh_token": data["refresh_token"]
				})
			strava_tokens = response.json()

	else:
		print(f"] generating a new token")
		response = requests.post(
			url = "https://www.strava.com/oauth/token",
			data = {
				"client_id": config["strava_api"]["client_id"],
				"client_secret": config["strava_api"]["client_secret"],
				"code": config["strava_api"]["code"], # this is the thing manually grabbed from the url after you click the "Authorize" button here: http://www.strava.com/oauth/authorize?client_id={client_id}&response_type=code&redirect_uri=http://localhost/exchange_token&approval_prompt=force&scope=profile:read_all,activity:read_all
				"grant_type": "authorization_code"
			})
		strava_tokens = response.json()

	# save the new token data
	with open(tokens_file, "w+") as f:
		f.write(json.dumps(strava_tokens, indent="\t"))
	return strava_tokens["access_token"]

def download_activity_data(athlete_id):
	access_token = get_strava_token()
	headers = {
		"Authorization": f"Bearer {access_token}"
	}

	url = f"https://www.strava.com/api/v3/athletes/{athlete_id}/activities?per_page=200"
	# todo: update this to work for multiple pages

	print(f"] retrieving athlete {athlete_id} data")
	result = requests.get(url, headers=headers)
	activities = result.json()
	with open(os.path.join(cache_dir, f"strava_athlete_{athlete_id}_activities.json"), "w+") as f:
		f.write(json.dumps(activities, indent="\t"))

	for activity in activities:
		activity_id = activity["id"]
		filename = os.path.join(cache_dir, f"strava_activity_{activity_id}.json")
		if os.path.exists(filename):
			print(f"] activity {activity_id} stream already cached")
			continue

		print(f"] retrieving activity {activity_id} stream")
		url = f"https://www.strava.com/api/v3/activities/{activity_id}/streams?keys=latlng,time&key_by_type=true"
		result = requests.get(url, headers=headers)
		with open(filename, "w+") as f:
			f.write(json.dumps(result.json(), indent="\t"))

download_activity_data(config["athlete_id"])