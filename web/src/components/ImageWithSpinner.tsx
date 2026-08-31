"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

interface ImageWithSpinnerProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  spinnerClassName?: string;
}

// generic img with a centered loading spinner until the image is ready. needs to sit
// inside a position:relative (or absolute) container, same as a normal <img>
export function ImageWithSpinner({
  spinnerClassName = "w-6 h-6",
  onLoad,
  onError,
  ...imgProps
}: ImageWithSpinnerProps) {
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
      <img
        ref={imgRef}
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
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/40 pointer-events-none">
          <Loader2 className={`${spinnerClassName} text-muted-foreground animate-spin`} />
        </div>
      )}
    </>
  );
}
