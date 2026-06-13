import { dbService } from './db';

export async function playSound(soundName: 'confetti' | 'achievement' | 'click' | 'swipe') {
  try {
    const profile = await dbService.getProfile();
    if (profile && profile.soundEffectsEnabled) {
      const audio = new Audio(`/sounds/${soundName}.mp3`);
      await audio.play();
    }
  } catch (err) {
    // Fail silently to prevent app crashes if audio assets are missing
    console.warn(`Sound playback failed for: ${soundName}`, err);
  }
}
