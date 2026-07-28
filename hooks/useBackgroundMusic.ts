
import { useState, useEffect, useCallback, useRef } from 'react';

const MUSIC_STORAGE_KEY = 'hexGameMusicEnabledV1'; // Added V1 for potential future preference changes
const MUSIC_URL = 'https://storage.cloud.google.com/hex-game-assets/hex_bg_music.mp3';
const DEFAULT_VOLUME = 0.3;
const FADE_INTERVAL_MS = 50;
const FADE_STEP = 0.05;

export const useBackgroundMusic = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);

  const [isMusicGloballyEnabled, setIsMusicGloballyEnabled] = useState<boolean>(() => {
    const storedPreference = localStorage.getItem(MUSIC_STORAGE_KEY);
    return storedPreference ? JSON.parse(storedPreference) : true; // Default to enabled
  });

  const [isActuallyPlaying, setIsActuallyPlaying] = useState<boolean>(false);
  const [playbackFailedDueToNoInteraction, setPlaybackFailedDueToNoInteraction] = useState<boolean>(false);


  useEffect(() => {
    if (!audioRef.current) {
      try {
        audioRef.current = new Audio(MUSIC_URL);
        audioRef.current.loop = true;
        audioRef.current.volume = 0; // Start muted, will fade in
      } catch (error) {
        console.error("Error creating audio element:", error);
      }
    }
    
    const currentAudioElement = audioRef.current; 

    return () => {
      if (currentAudioElement) {
        currentAudioElement.pause();
      }
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
      }
    };
  }, []);

  const clearFadeInterval = useCallback(() => {
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
  }, []);

  const fadeIn = useCallback(() => {
    clearFadeInterval();
    if (!audioRef.current || !isMusicGloballyEnabled) {
      if (!isMusicGloballyEnabled && audioRef.current && !audioRef.current.paused) {
          audioRef.current.pause();
          setIsActuallyPlaying(false);
      }
      // If globally disabled, any previous interaction failure is no longer relevant for a retry.
      setPlaybackFailedDueToNoInteraction(false);
      return;
    }

    // If music is already playing at target volume and no interaction issue, do nothing.
    if (audioRef.current.volume >= DEFAULT_VOLUME && !audioRef.current.paused && !playbackFailedDueToNoInteraction) {
        setIsActuallyPlaying(true);
        return;
    }
    
    audioRef.current.volume = 0; 
    audioRef.current.play().then(() => {
      setIsActuallyPlaying(true);
      setPlaybackFailedDueToNoInteraction(false); // Playback succeeded, clear flag.
      fadeIntervalRef.current = setInterval(() => {
        if (audioRef.current && audioRef.current.volume < DEFAULT_VOLUME) {
          const newVolume = Math.min(audioRef.current.volume + FADE_STEP, DEFAULT_VOLUME);
          audioRef.current.volume = newVolume;
          if (newVolume >= DEFAULT_VOLUME) {
            clearFadeInterval();
          }
        } else {
          clearFadeInterval(); 
        }
      }, FADE_INTERVAL_MS) as unknown as number;
    }).catch(error => {
      if (error.name === 'NotAllowedError' || (error.message && error.message.toLowerCase().includes("user didn't interact"))) {
        console.warn("Background music play attempt failed. User interaction may be required.", error.message);
        setPlaybackFailedDueToNoInteraction(true);
      } else {
        console.error("Error playing background music:", error);
        // For other errors, don't set the interaction flag as retrying after interaction might not help.
      }
      setIsActuallyPlaying(false);
    });
  }, [isMusicGloballyEnabled, clearFadeInterval, playbackFailedDueToNoInteraction]);

  const fadeOut = useCallback(() => {
    clearFadeInterval();
    if (!audioRef.current || audioRef.current.volume === 0) {
      if(audioRef.current && audioRef.current.paused === false) audioRef.current.pause();
      setIsActuallyPlaying(false);
      return;
    }

    fadeIntervalRef.current = setInterval(() => {
      if (audioRef.current && audioRef.current.volume > 0) {
        const newVolume = Math.max(audioRef.current.volume - FADE_STEP, 0);
        audioRef.current.volume = newVolume;
        if (newVolume <= 0) {
          audioRef.current.pause();
          setIsActuallyPlaying(false);
          clearFadeInterval();
        }
      } else {
        if(audioRef.current) audioRef.current.pause();
        setIsActuallyPlaying(false);
        clearFadeInterval();
      }
    }, FADE_INTERVAL_MS) as unknown as number;
  }, [clearFadeInterval]);

  const toggleMusicPreference = useCallback(() => {
    const newPreference = !isMusicGloballyEnabled;
    setIsMusicGloballyEnabled(newPreference);
    localStorage.setItem(MUSIC_STORAGE_KEY, JSON.stringify(newPreference));
  }, [isMusicGloballyEnabled]);


  const startBackgroundMusic = useCallback(() => {
    if (isMusicGloballyEnabled && audioRef.current) {
      // Attempt to play if:
      // 1. It's currently paused.
      // 2. Volume is significantly lower than target (might be mid-fade-out).
      // 3. Playback previously failed and requires user interaction (flag is true).
      if (audioRef.current.paused || audioRef.current.volume < DEFAULT_VOLUME * 0.95 || playbackFailedDueToNoInteraction) {
         fadeIn();
      } else if (!isActuallyPlaying) { // Volume is fine, not paused, but state indicates not playing
         setIsActuallyPlaying(true); // Sync state
      }
    }
  }, [isMusicGloballyEnabled, fadeIn, isActuallyPlaying, playbackFailedDueToNoInteraction]);

  const stopBackgroundMusic = useCallback(() => {
    // Also clear the interaction failure flag when explicitly stopping, 
    // as the next attempt to start should be fresh.
    setPlaybackFailedDueToNoInteraction(false); 
    if (isActuallyPlaying || (audioRef.current && audioRef.current.volume > 0)) {
       fadeOut();
    } else if (audioRef.current && !audioRef.current.paused) { 
       audioRef.current.pause();
       setIsActuallyPlaying(false);
    }
  }, [isActuallyPlaying, fadeOut]);
  
  useEffect(() => {
    if (!isMusicGloballyEnabled) {
      stopBackgroundMusic(); 
    }
    // The decision to start music if isMusicGloballyEnabled is true
    // is handled by the useEffect in AppContent based on game state.
  }, [isMusicGloballyEnabled, stopBackgroundMusic]);


  return {
    isMusicEnabled: isMusicGloballyEnabled,
    isMusicPlaying: isActuallyPlaying,
    toggleMusicPreference,
    startBackgroundMusic,
    stopBackgroundMusic,
  };
};
