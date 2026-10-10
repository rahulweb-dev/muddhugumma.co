// Which part of a photo stays visible when it is cropped (category banners and homepage tiles).
// Set per category in Admin → Categories; "top" keeps faces in wide banners.

export const IMAGE_FOCUS = [
  { value: "top", label: "Top (faces)", y: 0 },
  { value: "upper", label: "Upper middle", y: 25 },
  { value: "center", label: "Centre", y: 50 },
  { value: "lower", label: "Lower middle", y: 75 },
  { value: "bottom", label: "Bottom (borders, hems)", y: 100 },
] as const;

export type ImageFocus = (typeof IMAGE_FOCUS)[number]["value"];
export const IMAGE_FOCUS_VALUES = IMAGE_FOCUS.map((f) => f.value) as [ImageFocus, ...ImageFocus[]];

/** CSS object-position for a focus (defaults to the top). */
export const focusPosition = (f?: string | null) => `50% ${IMAGE_FOCUS.find((x) => x.value === f)?.y ?? 0}%`;
