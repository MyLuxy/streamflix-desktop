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

  // if the image is already cached at mount, onLoad never fires, so check .complete by hand.
  // useEffect not useLayoutEffect: the latter fires synchronously during the hydration
  // commit, and with dozens of cards on the home page all at once it looped the hydration
  // of loading.tsx's Suspense boundary on Opera GX (React error #419)
  useEffect(() => {
    setLoaded(imgRef.current?.complete ?? false);
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
