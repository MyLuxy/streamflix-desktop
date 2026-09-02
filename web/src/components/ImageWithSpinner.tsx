"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

// drag/animation handlers excluded: framer-motion's own gesture and animation-lifecycle
// types collide with the native DOM ones on <img>, and nothing here uses the native versions
type ImageWithSpinnerProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration"
>;

// generic img with a slow pulsing placeholder until it's ready, then a quick fade in
// (same reveal technique as the hero banner). needs to sit inside a position:relative
// (or absolute) container, same as a normal <img>
export function ImageWithSpinner({ onLoad, onError, ...imgProps }: ImageWithSpinnerProps) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // a server-rendered <img> starts loading the instant html parses, way before react
  // hydrates and attaches onError, a fast 404 fires and is gone before anyone's listening.
  // .complete + naturalWidth 0 after mount is how you catch that miss after the fact.
  // useEffect not useLayoutEffect: the latter fires synchronously during the hydration
  // commit, and with dozens of cards on the home page all at once it looped the hydration
  // of loading.tsx's Suspense boundary on Opera GX (React error #419)
  useEffect(() => {
    const img = imgRef.current;
    setLoaded(img?.complete ?? false);
    if (img?.complete && img.naturalWidth === 0) onError?.({} as React.SyntheticEvent<HTMLImageElement>);
    // onError excluded on purpose, callers dont memo it and this only needs to run per src
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgProps.src]);

  return (
    <>
      <motion.img
        ref={imgRef}
        initial={false}
        animate={{ opacity: loaded ? 1 : 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        onLoad={(e) => {
          setLoaded(true);
          onLoad?.(e);
        }}
        onError={(e) => {
          setLoaded(true);
          onError?.(e);
        }}
        {...imgProps}
      />
      {!loaded && <div className="absolute inset-0 bg-muted/40 animate-pulse pointer-events-none" />}
    </>
  );
}
