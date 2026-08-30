import { Navigation } from "@/components/Navigation";

// dont add a z-index here, navbar needs to stay on top
export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="flex items-center justify-center min-h-screen">
        <div className="page-loader">
          <span className="page-loader-bar" />
          <span className="page-loader-bar" />
          <span className="page-loader-bar" />
        </div>
      </div>
    </div>
  );
}
