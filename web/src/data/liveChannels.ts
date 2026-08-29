// src/data/liveChannels.ts

export interface LiveChannel {
  id: string;
  name: string;
  logo: string; // URL logo canale
  url: string;
  provider: 'pluto' | 'ustvgo';
  category: 'news' | 'entertainment' | 'sports' | 'movies';
}

export const liveChannels: LiveChannel[] = [
  // NEWS CHANNELS
  {
    id: 'cnn',
    name: 'CNN',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/CNN.svg/960px-CNN.svg.png',
    url: 'https://pluto.tv/it/live-tv/66c45ba803e3b20008d8c294',
    provider: 'pluto',
    category: 'news',
  },
  {
    id: 'cbs-news',
    name: 'CBS News',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/CBS_News.svg/960px-CBS_News.svg.png',
    url: 'https://pluto.tv/it/live-tv/6231ec4b62cd1f0007093c7b',
    provider: 'pluto',
    category: 'news',
  },
  {
    id: 'Pluto Comedy',
    name: 'Pluto Comedy',
    logo: 'https://images.pluto.tv/channels/5a4d3a00ad95e4718ae8d8db/colorLogoPNG.png',
    url: 'https://pluto.tv/live-tv/bloomberg-tv',
    provider: 'pluto',
    category: 'news',
  },
  
  // USTVGO CHANNELS
  {
    id: 'abc-ustvgo',
    name: 'ABC',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/ABC-2021-LOGO.svg/512px-ABC-2021-LOGO.svg.png',
    url: 'https://ustvgo.live/abc-live-streaming-free',
    provider: 'ustvgo',
    category: 'entertainment',
  },
  {
    id: 'Comedy Central',
    name: 'Comedy Central',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Comedy_Central_2018.svg/330px-Comedy_Central_2018.svg.png',
    url: 'https://ustvgo.live/comedy-central-channel/',
    provider: 'ustvgo',
    category: 'entertainment',
  },
  {
    id: 'bbc america',
    name: 'BBC America',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/BBC_logo_%281997-2021%29.svg/960px-BBC_logo_%281997-2021%29.svg.png',
    url: 'https://ustvgo.live/bbc-america/',
    provider: 'ustvgo',
    category: 'entertainment',
  },
  {
    id: 'espn-ustvgo',
    name: 'ESPN',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/ESPN_wordmark.svg/512px-ESPN_wordmark.svg.png',
    url: 'https://ustvgo.live/espn-hd/',
    provider: 'ustvgo',
    category: 'sports',
  },
  
  // ENTERTAINMENT CHANNELS (Pluto)
  {
    id: 'paramount-movie',
    name: 'Paramount Movie Channel',
    logo: 'https://cdn.mos.cms.futurecdn.net/UFo74BuGo7FYxhAE3DrWUP-1200-80.jpg',
    url: 'https://pluto.tv/live-tv/paramount-movie-channel',
    provider: 'pluto',
    category: 'movies',
  },
  {
    id: 'mtv-pluto',
    name: 'MTV Pluto TV',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/d/d7/MTV_Logo.png',
    url: 'https://pluto.tv/live-tv/mtv-pluto-tv',
    provider: 'pluto',
    category: 'entertainment',
  },
  
  // SPORTS CHANNELS (Pluto)
  {
    id: 'fox-business',
    name: 'FOX Business',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Fox_Business_Logo.svg/120px-Fox_Business_Logo.svg.png',
    url: 'https://ustvgo.live/fox-business/',
    provider: 'ustvgo',
    category: 'sports',
  },
  {
    id: 'nfl-channel',
    name: 'NFL Channel',
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a2/National_Football_League_logo.svg/250px-National_Football_League_logo.svg.png',
    url: 'https://ustvgo.live/nfl-redzone/',
    provider: 'ustvgo',
    category: 'sports',
  },
];
