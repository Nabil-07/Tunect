import { useState, useRef, useEffect } from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';

interface TutorVideoHoverProps {
  videoUrl: string;
  thumbnail?: string;
  duration?: number;
}

export default function TutorVideoHover({ videoUrl, thumbnail, duration }: TutorVideoHoverProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    // Delay video playback by 500ms to avoid accidental hovers
    hoverTimeoutRef.current = setTimeout(() => {
      setIsPlaying(true);
      setShowControls(true);
      if (videoRef.current) {
        videoRef.current.play().catch(err => console.log('Autoplay prevented:', err));
      }
    }, 500);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    if (!isMaximized) {
      setIsPlaying(false);
      setShowControls(false);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  };

  const handleMaximize = () => {
    setIsMaximized(true);
    if (videoRef.current && !isPlaying) {
      setIsPlaying(true);
      videoRef.current.play();
    }
  };

  const handleMinimize = () => {
    setIsMaximized(false);
  };

  const handleClose = () => {
    setIsPlaying(false);
    setIsMaximized(false);
    setShowControls(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  const handleVideoEnd = () => {
    setIsPlaying(false);
    setIsMaximized(false);
    setShowControls(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      className="relative w-full h-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Video Container */}
      <div className="relative w-full h-full overflow-hidden rounded-lg">
        <video
          ref={videoRef}
          src={videoUrl}
          poster={thumbnail}
          className="w-full h-full object-cover"
          onEnded={handleVideoEnd}
          muted={!isMaximized}
          loop={false}
        />

        {/* Play indicator overlay */}
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
              <div className="w-0 h-0 border-t-[12px] border-t-transparent border-l-[20px] border-l-blue-600 border-b-[12px] border-b-transparent ml-1" />
            </div>
          </div>
        )}

        {/* Controls overlay */}
        {showControls && isPlaying && (
          <div className="absolute top-2 right-2 flex gap-2">
            {!isMaximized ? (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleMaximize();
                }}
                className="p-2 bg-white/90 hover:bg-white rounded-full shadow-lg transition-colors"
                title="Maximize video"
              >
                <Maximize2 className="w-4 h-4 text-gray-700" />
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleMinimize();
                }}
                className="p-2 bg-white/90 hover:bg-white rounded-full shadow-lg transition-colors"
                title="Minimize video"
              >
                <Minimize2 className="w-4 h-4 text-gray-700" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleClose();
              }}
              className="p-2 bg-white/90 hover:bg-white rounded-full shadow-lg transition-colors"
              title="Close video"
            >
              <X className="w-4 h-4 text-gray-700" />
            </button>
          </div>
        )}

        {/* Duration badge */}
        {duration && !isPlaying && (
          <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 text-white text-xs rounded">
            {Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, '0')}
          </div>
        )}
      </div>

      {/* Maximized overlay */}
      {isMaximized && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
          <div className="relative max-w-4xl w-full">
            <video
              src={videoUrl}
              className="w-full rounded-lg shadow-2xl"
              controls
              autoPlay
              onEnded={handleVideoEnd}
            />
            <button
              onClick={handleClose}
              className="absolute -top-12 right-0 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            >
              <X className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
