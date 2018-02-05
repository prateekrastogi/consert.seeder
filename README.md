------ Docker ------

docker build -t seeder .

docker run -p 3200:3200 seeder


------ API Authentication Access Token ------

{
"email": "prtk6592@gmail.com",
"password": "openssssame"
}

------ Model Description ------

artist-seed: Fetches the spotify id and name of artists
dependent on: nothing

enriched-artist: Fetches the detailed spotify data of artists from artist-seeds
dependent on: artist-seed

yt-video: Fetches the past live performances of the enriched-artists 
dependent on: enriched-artist

recombee: Seeds the yt-videos of type 'video' and enriched-artist of type 'artist' to recombee
dependent on: enriched-artist and yt-video
set* methods: Mostly used while setting the whole/part thing up from scratch, otherwise no usage in regular system running

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

User Properties:
---------------

userType <string>: Type of user accessing the site such as 'guest', 'spotify' signed up etc. Guest user's primary id is                      generated via cuid library from frontend
browser-ids <set>: Browser Id's of the browsers from which user has accessed us so far 
