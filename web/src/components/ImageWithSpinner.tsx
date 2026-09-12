"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

// drag/animation handlers excluded, framer-motion's gesture types collide with native DOM ones on <img>
type ImageWithSpinnerProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration"
>;

// generic img with a pulsing placeholder then a fade in, needs a position:relative container
export function ImageWithSpinner({ onLoad, onError, ...imgProps }: ImageWithSpinnerProps) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // a server-rendered <img> can 404 before onError attaches, .complete + naturalWidth 0 catches it after
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
