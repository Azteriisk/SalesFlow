import { playSound } from './sound';

export function triggerConfetti() {
  // Check if canvas already exists to prevent duplicate overlays
  if (document.getElementById('salesflow-confetti-canvas')) return;

  playSound('confetti');

  const canvas = document.createElement('canvas');
  canvas.id = 'salesflow-confetti-canvas';
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

  const resizeHandler = () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  };
  window.addEventListener('resize', resizeHandler);

  // Gruvbox themed colors: Orange, Sage, success Green, Yellow, Red, Purple, Cream
  const colors = ['#fe8019', '#8ec07c', '#b8bb26', '#fabd2f', '#fb4934', '#d3869b', '#ebdbb2'];
  const particles: any[] = [];

  for (let i = 0; i < 120; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * -height - 20,
      r: Math.random() * 6 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 5,
      tiltAngleIncremental: Math.random() * 0.07 + 0.02,
      tiltAngle: 0,
      speed: Math.random() * 3 + 2.5
    });
  }

  const startTime = Date.now();
  let animationFrameId: number;

  function draw() {
    ctx!.clearRect(0, 0, width, height);

    let active = false;
    particles.forEach((p) => {
      p.tiltAngle += p.tiltAngleIncremental;
      p.y += p.speed;
      p.x += Math.sin(p.tiltAngle) * 0.5;
      
      if (p.y < height) {
        active = true;
      }

      ctx!.beginPath();
      ctx!.lineWidth = p.r;
      ctx!.strokeStyle = p.color;
      ctx!.moveTo(p.x + p.tilt + p.r / 2, p.y);
      ctx!.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
      ctx!.stroke();
    });

    if (active && Date.now() - startTime < 3500) {
      animationFrameId = requestAnimationFrame(draw);
    } else {
      cleanup();
    }
  }

  function cleanup() {
    window.removeEventListener('resize', resizeHandler);
    cancelAnimationFrame(animationFrameId);
    if (canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
  }

  draw();
}
