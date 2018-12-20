// Todo: Replace all instances of bufferCount with bufferTime to handle edge case of last unfilled buffer. 

------ Docker ------

docker build -t seeder .

docker run -p 3200:3200 -it seeder


------ API Authentication Access Token ------

{
"email": "prtk6592@gmail.com",
"password": "openssssame"
}

Hit /users/login endpoint with this credential, and the id property of the response object is access token. 

------ Deployment Guidelines ------

- Run artist-seed model put* method to completion to get list of top artists and their ids

- Run enriched-artist model put* method, preferably till completion, to get enrich the artist data

- Run yt-Video model put* method, first for top-rated artists, to get all the relevant past live performances of those      artists. The popularity parameters to be passed 'priority-wise' are (70-100, 60-70, 44-60). Take special care to pass     lower bounds of popularity exactly as stated, as they are hard-coded in code and affect the count of returned results.
  Also, run mark* method of yt-Video model to periodically check fo removed items.

- Run recombee set(item/user)properties methods to initialize recombee data model. 

- Run seed* method of genre, and sync* methods of recombee, elastic-video, & yt-broadcast to keep the fetched videos in     sync with those services 

- You can use set* methods of the models to reset/restart cleanly that model processes. Using set* methods anytime &        anywhere will ideally not affect the correctness/stability of the overall system. Although, it may trigger the            reprocessing on the dependent models processes. So beware of computation costs/time. Ideally, set* methods are 'very      rarely' needed

- Each model can be run independently as a self-contained microservice if computation pressure forces horizontal scaling.   But, if we need the multiple running instances of same model method/s, then we need code refactoring for concurrency      control    

------ Model Description & Primary Responsibilities ------

artist-seed: Fetches the spotify id and name of artists
dependent on: nothing
---
genre: Sync the itemType `genre` to recommender.
---
enriched-artist: Fetches the detailed spotify data of artists from artist-seeds
dependent on: artist-seed
---
yt-video: Fetches the past live performances of the enriched-artists 
dependent on: enriched-artist
model field 'artist': enriched 'artists' whose yt search returned this video
model field 'albums': enriched 'artist albums' whose yt search returned this video
model field 'tracks': enriched 'artist top tracks' whose yt search returned this video
model field 'isRemoved': tells whether the video isRemoved from yt
---
yt-broadcast: Handles the fetching, updation, and removal of  `live now` yt broadcasts   
model field 'isRemoved': tells whether the broadcast isRemoved from yt
---
recommender: Continuously Syncs the yt-videos of type 'video', 'broadcast', and enriched-artist of type 'artist' to recommender
dependent on: enriched-artist and yt-video
---
elastic-video: Continuously syncs the modified yt-videos with artists ids replaced by artists 'names' and 'genres' 
dependent on: enriched-artist and yt-video
---
All models set* methods: Mostly used for cleanly restarting/resetting model sync/put methods from scratch, otherwise no usage in running regular system


------ Recommender Data Model ------

`snippet-publishedAt`: dateTime

All other item metadata fields are array of strings serialized via binning. 

