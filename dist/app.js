window.initFarm = () => {
  'use strict';
  window.cleanupFarm?.();
  const controller = new AbortController();
  const observers = [];
  const listen = (target, type, handler, options = {}) => target.addEventListener(type, handler, {...options, signal: controller.signal});
  window.cleanupFarm = () => { controller.abort(); observers.forEach(observer => observer.disconnect()); };

  const menuButton = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('.main-nav');
  const header = document.querySelector('.site-header');
  const closeMenu = () => {
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'פתיחת תפריט');
    navigation.classList.remove('is-open');
  };

  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'סגירת תפריט' : 'פתיחת תפריט');
    navigation.classList.toggle('is-open', open);
  });
  navigation.addEventListener('click', event => {
    if (event.target.closest('a')) closeMenu();
  });
  listen(document, 'click', event => {
    if (!header.contains(event.target)) closeMenu();
  });
  listen(document, 'keydown', event => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
      closeMenu();
      menuButton.focus();
    }
  });
  const screenChange = window.matchMedia('(min-width: 801px)');
  listen(screenChange, 'change', event => { if (event.matches) closeMenu(); });

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hero = document.querySelector('.hero');
  const heroImage = document.querySelector('.hero-image');
  const progress = document.createElement('div');
  progress.className = 'reading-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.append(progress);
  let heroHeight = (hero?.offsetHeight || 0);
  let scrollRange = 1;
  const measureScroll = () => {
    heroHeight = (hero?.offsetHeight || 0);
    scrollRange = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  };
  listen(window, 'resize', measureScroll, { passive: true });
  listen(window, 'load', measureScroll, { once: true });
  if ('ResizeObserver' in window) { const observer = new ResizeObserver(measureScroll); observers.push(observer); observer.observe(document.body); }
  measureScroll();
  listen(reducedMotion, 'change', () => {
    if (heroImage) heroImage.style.transform = '';
    if (reducedMotion.matches) document.documentElement.classList.remove('js-reveal');
  });
  document.querySelectorAll('.timeline-item').forEach((item, index) => {
    item.style.setProperty('--reveal-delay', `${index * 85}ms`);
  });
  let scrollScheduled = false;
  const updateHeader = () => {
    const y = window.scrollY;
    header.classList.toggle('scrolled', y > 12);
    progress.style.transform = `scaleX(${Math.min(1, y / scrollRange)})`;
    if (heroImage && !reducedMotion.matches && y <= heroHeight + 100) {
      heroImage.style.transform = `translate3d(0, ${Math.min(y * 0.12, 75)}px, 0) scale(1.12)`;
    }
    scrollScheduled = false;
  };
  listen(window, 'scroll', () => {
    if (!scrollScheduled) {
      window.requestAnimationFrame(updateHeader);
      scrollScheduled = true;
    }
  }, { passive: true });
  updateHeader();

  if ('IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        navigation.querySelectorAll('a').forEach(link => {
          if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-15% 0px -65% 0px', threshold: 0 });
    observers.push(sectionObserver);
    document.querySelectorAll('main section[id]').forEach(section => sectionObserver.observe(section));

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.documentElement.classList.add('js-reveal');
      const revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
      observers.push(revealObserver);
      document.querySelectorAll('.reveal').forEach(element => revealObserver.observe(element));
    }
  }

  const experiences = [...document.querySelectorAll('.experience')];
  experiences.forEach(item => item.addEventListener('toggle', () => {
    if (item.open) experiences.forEach(other => { if (other !== item) other.open = false; });
  }));

  const sourceDetails = document.querySelector('.sources');
  const showSource = () => {
    if (sourceDetails && window.location.hash.startsWith('#source-')) {
      sourceDetails.open = true;
      const target = document.getElementById(window.location.hash.slice(1));
      if (target) window.requestAnimationFrame(() => target.scrollIntoView({ block: 'center' }));
    }
  };
  listen(window, 'hashchange', showSource);
  showSource();

  const wazeDialog = document.querySelector('.waze-dialog');
  let wazeTrigger;
  document.querySelectorAll('a[href*="waze.com"]:not(.waze-launch)').forEach(link => {
    link.setAttribute('aria-haspopup', 'dialog');
    link.addEventListener('click', event => {
      event.preventDefault();
      wazeTrigger = link;
      wazeDialog.showModal();
    });
  });
  wazeDialog.querySelectorAll('.waze-close').forEach(button => button.addEventListener('click', () => wazeDialog.close()));
  wazeDialog.addEventListener('close', () => wazeTrigger?.focus());
  wazeDialog.addEventListener('click', event => {
    if (event.target !== wazeDialog) return;
    const rect = wazeDialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) wazeDialog.close();
  });

  const toast = document.querySelector('.toast');
  let toastTimer;
  const notify = message => {
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 4000);
  };
  document.querySelector('.share-button')?.addEventListener('click', async () => {
    const url = document.querySelector('link[rel="canonical"]').href;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'חוות רווה', text: 'קרוב לאדמה. קרוב ללב. הכירו את חוות רווה שליד טנא עומרים.', url });
      } else if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        notify('הקישור לאתר הועתק');
      } else {
        window.prompt('העתיקו את הקישור לשיתוף:', url);
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        window.prompt('אפשר להעתיק את הקישור לשיתוף:', url);
      }
    }
  });
  document.querySelector('#year').textContent = String(new Date().getFullYear());
};
