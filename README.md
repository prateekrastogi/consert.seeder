------ Docker ------

docker build -t seeder .

docker run -p 3200:3200 seeder


------ API Authentication Access Token ------

{
"email": "prtk6592@gmail.com",
"password": "openssssame"
}


------ Deployment Guidelines ------

- Run artist-seed model put* method to completion to get list of top artists and their ids

- Run enriched-artist model put* method, preferably till completion, to get enrich the artist data

- Run yt-Video model put* method, first for top-rated artists, to get all the relevant past live performances of those      artists. The popularity parameters to be passed 'priority-wise' are (70-100, 60-70, 44-60). Take special care to pass     lower bounds of popularity exactly as stated, as they are hard-coded in code and affect the count of returned results

- Run sync* methods of recombee & elastic-video to keep the fetched videos in sync with those services 

- You can use set* methods of the models to reset/restart cleanly that model processes. Using set* methods anytime &        anywhere will ideally not affect the correctness/stability of the overall system. Although, it may trigger the            reprocessing on the dependent models processes. So beware of computation costs/time. Ideally, set* methods are 'very      rarely' needed to update stale data     


------ Model Description ------

artist-seed: Fetches the spotify id and name of artists
dependent on: nothing
---
enriched-artist: Fetches the detailed spotify data of artists from artist-seeds
dependent on: artist-seed
---
yt-video: Fetches the past live performances of the enriched-artists 
dependent on: enriched-artist
model field 'artist': enriched 'artists' whose yt search returned this video
model field 'albums': enriched 'artist albums' whose yt search returned this video
model field 'tracks': enriched 'artist top tracks' whose yt search returned this video
---
recombee: Continuously Syncs the yt-videos of type 'video' and enriched-artist of type 'artist' to recombee
dependent on: enriched-artist and yt-video
---
elastic-video: Continuously syncs the modified yt-videos with artist ids replaced by artist names
dependent on: enriched-artist and yt-video
---
All models set* methods: Mostly used for cleanly restarting/resetting model sync/put methods from scratch, otherwise no usage in running regular system


------ Recombee Data Model ------

Item Properties:
---------------

itemType <string>: ItemType of uploaded recommendation items, can be of multiple types such as 'video','artist','genre' 
kind <string>: Youtube resource kind
etag <string>: Http etag of the resource
contentDetails-duration <string>
contentDetails-dimension <string>
contentDetails-definition <string>
contentDetails-caption <string>
contentDetails-licensedContent <boolean>
contentDetails-projection <string>
statistics-viewCount <string>
statistics-likeCount <string>
statistics-dislikeCount <string>
statistics-favoriteCount <string>
statistics-commentCount <string>
snippet-publishedAt <timestamp>
snippet-channelId <string>
snippet-title <string>
snippet-description <string>
snippet-channelTitle <string>
snippet-thumbnails <string>
snippet-liveBroadcastContent <string>: flag indicating the status of broadcast i.e. upcoming, live, completed, or none. 
artists-ids <set>: Id's of all the artists that returns that particular video
genres <set>: Genres associated with that item
artists-names <set>: Names of all the artists involved in any particular video
artists-popularity <set>: Popularity of all the artists involved in any particular video
artists-followers <set>: Followers of all the artists involved in any particular video
artists-relatedArtists <set>: Related artists of all the artists involved in any particular video
artists-type <set>: Types of all the artists involved in any particular video

Not including artist top tracks in metadata due to biases in spotify top tracks algo. Similarly, excluding album meta data as un-necessary result matching in youtube search makes it a very weak correlation signal. 

User Properties:
---------------

userType <string>: Type of user accessing the site such as 'guest', 'spotify' signed up etc. Guest user's primary id is                      generated via cuid library from frontend
browser-ids <set>: Browser Id's of the browsers from which user has accessed us so far 
