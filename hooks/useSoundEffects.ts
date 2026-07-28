import { useRef, useEffect, useCallback } from 'react';
import { CLICK_SOUND_URL } from '../Constants'; // Assuming CLICK_SOUND_URL is defined in Constants

const MESSAGE_CHIME_SOUND_URL = 'https://storage.cloud.google.com/hex-game-assets/hex_msg_chime.mp3';

interface UseSoundEffectsProps {
  isGloballyEnabled: boolean; // Controls if sounds play
}

export const useSoundEffects = ({ isGloballyEnabled }: UseSoundEffectsProps) => {
  const clickAudioRef = useRef<HTMLAudioElement | null>(null);
  const messageChimeAudioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize the Audio objects when the component mounts
  useEffect(() => {
    try {
      const clickAudio = new Audio(CLICK_SOUND_URL);
      clickAudio.preload = 'auto'; 
      clickAudio.volume = 0.5; 
      clickAudioRef.current = clickAudio;
    } catch (error) {
      console.error("Error creating click sound audio element:", error);
    }

    try {
      const chimeAudio = new Audio(MESSAGE_CHIME_SOUND_URL);
      chimeAudio.preload = 'auto';
      chimeAudio.volume = 0.6; // Slightly different volume for chime if desired
      messageChimeAudioRef.current = chimeAudio;
    } catch (error) {
      console.error("Error creating message chime audio element:", error);
    }
    
    return () => {
      if (clickAudioRef.current) {
        clickAudioRef.current.pause();
        clickAudioRef.current = null;
      }
      if (messageChimeAudioRef.current) {
        messageChimeAudioRef.current.pause();
        messageChimeAudioRef.current = null;
      }
    };
  }, []);

  const playClickSound = useCallback(() => {
    if (!isGloballyEnabled || !clickAudioRef.current) {
      return;
    }
    const audio = clickAudioRef.current;
    audio.currentTime = 0; 
    audio.play().catch(error => {
      console.warn("Click sound play failed:", error);
    });
  }, [isGloballyEnabled]);

  const playMessageChimeSound = useCallback(() => {
    if (!isGloballyEnabled || !messageChimeAudioRef.current) {
      return;
    }
    const audio = messageChimeAudioRef.current;
    audio.currentTime = 0;
    audio.play().catch(error => {
      console.warn("Message chime play failed:", error);
    });
  }, [isGloballyEnabled]);

  return {
    playClickSound,
    playMessageChimeSound,
    isSoundEffectsEnabled: isGloballyEnabled,
  };
};
