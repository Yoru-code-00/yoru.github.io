(() => {
  'use strict';

  /* =========================
     Profile Background Typing
  ========================= */
  const profileBg = document.getElementById('profileBg');
  const profileStage = document.getElementById('profileStage');

  if (profileBg && profileStage) {
    const messages = [
      { tag: 'LOG', text: 'Initializing...' },
      { tag: 'NODE', text: 'Signal linked.' },
      { tag: 'SYNC', text: 'Typing stream ready.' },
      { tag: 'TRACE', text: 'Packet detected.' },
      { tag: 'BOOT', text: 'Visual loop active.' },
      { tag: 'FLOW', text: 'Random spawn complete.' },
      { tag: 'SCAN', text: 'Surface responding...' },
      { tag: 'PING', text: 'Input signal found.' },
      { tag: 'DATA', text: 'Sequence building...' },
      { tag: 'CORE', text: 'State updated.' },
      { tag: 'TASK', text: 'Next node loading...' },
      { tag: 'LINK', text: 'Channel stabilized.' }
    ];

    const config = {
      maxCards: 50,
      spawnInterval: 360,
      typingMin: 32,
      typingMax: 60,
      holdMin: 1400,
      holdMax: 2200,
      padding: 24,
      collisionGap: 8,
      placementAttempts: 60,
      minCardWidth: 220,
      maxCardWidth: 460,
      centerSafeZoneRatio: 0.18
    };

    const activeCards = new Map();
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let nextId = 1;
    let nextTheme = 'light';
    let spawnTimer = null;
    let burstTimers = [];

    const random = (min, max) => Math.random() * (max - min) + min;
    const randomInt = (min, max) => Math.floor(random(min, max + 1));
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const pad = (num) => String(num).padStart(2, '0');
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function rectsOverlap(a, b, gap = 0) {
      return !(
        a.x + a.w + gap < b.x ||
        a.x > b.x + b.w + gap ||
        a.y + a.h + gap < b.y ||
        a.y > b.y + b.h + gap
      );
    }

    function getNextTheme() {
      const theme = nextTheme;
      nextTheme = nextTheme === 'light' ? 'dark' : 'light';

      if (Math.random() < 0.18) {
        nextTheme = Math.random() < 0.5 ? 'light' : 'dark';
      }

      return theme;
    }

    function createCardElement(data, id, theme) {
      const card = document.createElement('div');
      card.className = `typing-card ${theme === 'dark' ? 'theme-dark' : 'theme-light'}`;
      card.dataset.id = id;
      card.dataset.theme = theme;

      const now = new Date();
      const timeText = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

      card.innerHTML = `
        <div class="typing-head">
          <div class="typing-tag">${data.tag}</div>
          <div class="typing-meta">${timeText}</div>
        </div>
        <div class="typing-body">
          <span class="typing-line"></span><span class="cursor">|</span>
        </div>
        <div class="typing-footer">
          <div class="typing-progress"><span></span></div>
          <div class="typing-state">typing</div>
        </div>
      `;

      return card;
    }

    function measureFinalCardSize(card, text) {
      const line = card.querySelector('.typing-line');

      const measure = document.createElement('span');
      measure.className = 'typing-measure';
      measure.textContent = text;
      document.body.appendChild(measure);

      line.textContent = text;
      card.style.visibility = 'hidden';
      card.style.width = 'auto';
      profileStage.appendChild(card);

      const textWidth = Math.ceil(measure.getBoundingClientRect().width);
      const baseRect = card.getBoundingClientRect();

      measure.remove();
      line.textContent = '';

      const finalWidth = Math.min(
        config.maxCardWidth,
        Math.max(config.minCardWidth, textWidth + 48)
      );

      card.style.width = `${config.minCardWidth}px`;

      return {
        finalWidth,
        finalHeight: Math.ceil(baseRect.height)
      };
    }

    function choosePosition(cardWidth, cardHeight) {
      const stageRect = profileStage.getBoundingClientRect();

      const maxX = Math.max(
        config.padding,
        stageRect.width - cardWidth - config.padding
      );

      const maxY = Math.max(
        config.padding,
        stageRect.height - cardHeight - config.padding
      );

      const centerSafeWidth = stageRect.width * config.centerSafeZoneRatio;
      const centerSafeHeight = stageRect.height * config.centerSafeZoneRatio;

      const centerSafeRect = {
        x: stageRect.width / 2 - centerSafeWidth / 2,
        y: stageRect.height / 2 - centerSafeHeight / 2,
        w: centerSafeWidth,
        h: centerSafeHeight
      };

      let best = null;
      let bestScore = -Infinity;

      for (let i = 0; i < config.placementAttempts; i += 1) {
        const candidate = {
          x: random(config.padding, maxX),
          y: random(config.padding, maxY),
          w: cardWidth,
          h: cardHeight
        };

        if (rectsOverlap(candidate, centerSafeRect, 8)) {
          continue;
        }

        let overlapped = false;
        let minDistance = Infinity;

        for (const item of activeCards.values()) {
          const other = item.rect;

          if (rectsOverlap(candidate, other, config.collisionGap)) {
            overlapped = true;
            break;
          }

          const dx = (candidate.x + candidate.w / 2) - (other.x + other.w / 2);
          const dy = (candidate.y + candidate.h / 2) - (other.y + other.h / 2);
          const dist = Math.hypot(dx, dy);
          minDistance = Math.min(minDistance, dist);
        }

        if (overlapped) {
          continue;
        }

        const score = Number.isFinite(minDistance) ? minDistance : 9999;

        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }

      if (best) {
        return best;
      }

      return {
        x: random(config.padding, maxX),
        y: random(config.padding, maxY),
        w: cardWidth,
        h: cardHeight
      };
    }

    async function typeMessage(card, data, finalWidth) {
      const line = card.querySelector('.typing-line');
      const progress = card.querySelector('.typing-progress > span');
      const state = card.querySelector('.typing-state');
      const chars = [...data.text];

      if (prefersReducedMotion) {
        line.textContent = data.text;
        progress.style.width = '100%';
        card.style.width = `${finalWidth}px`;
        state.textContent = 'done';
        return;
      }

      for (let i = 0; i < chars.length; i += 1) {
        line.textContent += chars[i];

        const ratio = (i + 1) / chars.length;
        const currentWidth =
          config.minCardWidth + (finalWidth - config.minCardWidth) * ratio;

        card.style.width = `${currentWidth}px`;
        progress.style.width = `${ratio * 100}%`;

        await sleep(randomInt(config.typingMin, config.typingMax));
      }

      state.textContent = 'done';
    }

    async function spawnCard() {
      if (document.hidden || activeCards.size >= config.maxCards) {
        return;
      }

      const data = pick(messages);
      const id = nextId;
      nextId += 1;

      const theme = getNextTheme();
      const card = createCardElement(data, id, theme);

      const measured = measureFinalCardSize(card, data.text);
      const pos = choosePosition(measured.finalWidth, measured.finalHeight);

      card.style.left = `${pos.x}px`;
      card.style.top = `${pos.y}px`;
      card.style.width = `${config.minCardWidth}px`;
      card.style.visibility = 'visible';

      activeCards.set(id, {
        el: card,
        rect: {
          x: pos.x,
          y: pos.y,
          w: measured.finalWidth,
          h: measured.finalHeight
        }
      });

      requestAnimationFrame(() => {
        card.classList.add('show');
      });

      await sleep(prefersReducedMotion ? 0 : 70);
      await typeMessage(card, data, measured.finalWidth);
      await sleep(prefersReducedMotion ? 800 : randomInt(config.holdMin, config.holdMax));

      card.classList.add('fade-out');
      await sleep(prefersReducedMotion ? 80 : 460);

      activeCards.delete(id);
      card.remove();
    }

    function clearBurstTimers() {
      burstTimers.forEach((timerId) => clearTimeout(timerId));
      burstTimers = [];
    }

    function startSpawner() {
      if (spawnTimer) {
        return;
      }

      clearBurstTimers();

      const burstCount = prefersReducedMotion ? 2 : 5;
      for (let i = 0; i < burstCount; i += 1) {
        const timerId = window.setTimeout(() => {
          spawnCard();
        }, 100 + i * 180);
        burstTimers.push(timerId);
      }

      if (!prefersReducedMotion) {
        spawnTimer = window.setInterval(spawnCard, config.spawnInterval);
      }
    }

    function stopSpawner() {
      clearBurstTimers();
      if (spawnTimer) {
        clearInterval(spawnTimer);
        spawnTimer = null;
      }
    }

    function initSpawner() {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !document.hidden) {
            startSpawner();
          } else {
            stopSpawner();
          }
        },
        { threshold: 0.1 }
      );

      observer.observe(profileBg);

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          stopSpawner();
        }
      });
    }

    function initPointerParallax() {
      if (prefersReducedMotion) {
        profileStage.style.setProperty('--mx', 0.5);
        profileStage.style.setProperty('--my', 0.5);
        return;
      }

      profileBg.addEventListener('pointermove', (e) => {
        const rect = profileBg.getBoundingClientRect();
        const mx = (e.clientX - rect.left) / rect.width;
        const my = (e.clientY - rect.top) / rect.height;

        profileStage.style.setProperty('--mx', mx);
        profileStage.style.setProperty('--my', my);
      });

      profileBg.addEventListener('pointerleave', () => {
        profileStage.style.setProperty('--mx', 0.5);
        profileStage.style.setProperty('--my', 0.5);
      });
    }

    initPointerParallax();
    initSpawner();
  }

  /* =========================
     Works Slider
  ========================= */
  const worksTrack = document.getElementById('worksTrack');
  const worksWrap = document.querySelector('.works-track-wrap');
  const worksCards = worksTrack ? Array.from(worksTrack.querySelectorAll('.works-card')) : [];
  const nextBtn = document.querySelector('.works-arrow--next');
  const prevBtn = document.querySelector('.works-arrow--prev');
  const indicators = Array.from(document.querySelectorAll('.works-indicator'));

  if (worksTrack && worksWrap && worksCards.length) {
    let currentIndex = 0;
    let resizeRaf = null;

    function updateWorksSlider() {
      const activeCard = worksCards[currentIndex];
      if (!activeCard) {
        return;
      }

      const wrapRect = worksWrap.getBoundingClientRect();
      const trackRect = worksTrack.getBoundingClientRect();
      const cardRect = activeCard.getBoundingClientRect();

      const cardCenterInTrack = (cardRect.left - trackRect.left) + cardRect.width / 2;
      const wrapCenter = wrapRect.width / 2;
      const translateX = cardCenterInTrack - wrapCenter;

      worksTrack.style.transform = `translateX(-${translateX}px)`;

      worksCards.forEach((card, index) => {
        card.classList.toggle('is-center', index === currentIndex);
      });

      indicators.forEach((dot, index) => {
        dot.classList.toggle('is-active', index === currentIndex);
      });
    }

    function requestSliderUpdate() {
      if (resizeRaf) {
        cancelAnimationFrame(resizeRaf);
      }

      resizeRaf = requestAnimationFrame(() => {
        updateWorksSlider();
      });
    }

    function goToSlide(index) {
      currentIndex = (index + worksCards.length) % worksCards.length;
      updateWorksSlider();
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        goToSlide(currentIndex + 1);
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        goToSlide(currentIndex - 1);
      });
    }

    indicators.forEach((dot, index) => {
      dot.addEventListener('click', () => {
        goToSlide(index);
      });
    });

    document.addEventListener('keydown', (e) => {
      const tagName = document.activeElement ? document.activeElement.tagName : '';
      const isTypingField = /INPUT|TEXTAREA|SELECT/.test(tagName);

      if (isTypingField) {
        return;
      }

      if (e.key === 'ArrowRight') {
        goToSlide(currentIndex + 1);
      }

      if (e.key === 'ArrowLeft') {
        goToSlide(currentIndex - 1);
      }
    });

    let touchStartX = 0;

    worksTrack.addEventListener(
      'touchstart',
      (e) => {
        touchStartX = e.touches[0].clientX;
      },
      { passive: true }
    );

    worksTrack.addEventListener(
      'touchend',
      (e) => {
        const diff = touchStartX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 40) {
          goToSlide(currentIndex + (diff > 0 ? 1 : -1));
        }
      },
      { passive: true }
    );

    window.addEventListener('resize', requestSliderUpdate);
    window.addEventListener('load', requestSliderUpdate);

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(requestSliderUpdate);
    }

    worksCards.forEach((card) => {
      const img = card.querySelector('img');
      if (img && !img.complete) {
        img.addEventListener('load', requestSliderUpdate, { once: true });
      }
    });

    updateWorksSlider();
  }
})();