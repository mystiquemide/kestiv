export interface Photo {
  file: string;
  width: number;
  height: number;
  alt: string;
  photographer: string;
  profileUrl: string;
  photoUrl: string;
}

const utm = "utm_source=kestiv&utm_medium=referral";

export const PHOTOS = {
  stairsShadow: {
    file: "/photos/stairs-shadow.jpg",
    width: 2400,
    height: 1600,
    alt: "Black and white photo of concrete steps, sharp shadows falling across the treads and a pale floor.",
    photographer: "Nedim",
    profileUrl: `https://unsplash.com/@nedimshoots?${utm}`,
    photoUrl: `https://unsplash.com/photos/concrete-stairs-with-sharp-shadows-MU9rJANL54c?${utm}`,
  },
  stairsWarm: {
    file: "/photos/stairs-warm.jpg",
    width: 2400,
    height: 3600,
    alt: "A straight flight of pale plaster steps rising through a doorway to a landing with a clay pot.",
    photographer: "Alesia Kazantceva",
    profileUrl: `https://unsplash.com/@alesiaskaz?${utm}`,
    photoUrl: `https://unsplash.com/photos/minimalist-concrete-staircase-with-vase-0B7ijYKaKcE?${utm}`,
  },
  laptopNight: {
    file: "/photos/laptop-night.jpg",
    width: 2400,
    height: 1600,
    alt: "A laptop with a code editor open, sitting on a concrete ledge in a dark room.",
    photographer: "Blake Connally",
    profileUrl: `https://unsplash.com/@blakeconnally?${utm}`,
    photoUrl: `https://unsplash.com/photos/macbook-pro-inside-gray-room-B3l0g6HLxr8?${utm}`,
  },
  stairsWhite: {
    file: "/photos/stairs-white.jpg",
    width: 2400,
    height: 1600,
    alt: "Wide white steps curving away from the camera, lit evenly with no colour.",
    photographer: "David Klein",
    profileUrl: `https://unsplash.com/@diklein?${utm}`,
    photoUrl: `https://unsplash.com/photos/architectural-photography-of-white-stair-Y-sL28f-riA?${utm}`,
  },
} as const satisfies Record<string, Photo>;

export const PHOTO_LIST: Photo[] = Object.values(PHOTOS);
