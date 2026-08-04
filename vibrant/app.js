// Vibrant Health & Wellness — shared behavior
(function () {
  // Footer year
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  // Mobile menu
  var toggle = document.getElementById('menuToggle');
  var menu = document.getElementById('menu');
  if (toggle && menu) {
    toggle.addEventListener('click', function () { menu.classList.toggle('open'); });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { menu.classList.remove('open'); });
    });
  }

  // Sticky nav shadow
  var nav = document.getElementById('nav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Hours: Mon 9–5:30 · Tue–Thu 8:30–6 · Fri–Sun closed
  var hours = {
    1: { open: '09:00', close: '17:30' },
    2: { open: '08:30', close: '18:00' },
    3: { open: '08:30', close: '18:00' },
    4: { open: '08:30', close: '18:00' },
    5: null, 6: null, 0: null
  };
  var now = new Date();
  var todayKey = now.getDay();

  document.querySelectorAll('.hours-list li[data-day="' + todayKey + '"]').forEach(function (li) {
    li.classList.add('today');
  });

  var statusEl = document.getElementById('open-status');
  if (statusEl) {
    var toMin = function (t) { var p = t.split(':'); return (+p[0]) * 60 + (+p[1]); };
    var fmt = function (t) {
      var p = t.split(':'); var h = +p[0]; var ampm = h >= 12 ? 'PM' : 'AM';
      var h12 = ((h + 11) % 12) + 1;
      return h12 + (p[1] === '00' ? '' : ':' + p[1]) + ' ' + ampm;
    };
    var nowMin = now.getHours() * 60 + now.getMinutes();
    var today = hours[todayKey];
    if (today && nowMin >= toMin(today.open) && nowMin < toMin(today.close)) {
      statusEl.innerHTML = '<strong style="color:#7CE8B5;">Open now</strong>&nbsp;· until ' + fmt(today.close);
    } else {
      var names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      var next = null;
      for (var i = 1; i <= 7; i++) {
        var k = (todayKey + i) % 7;
        if (hours[k]) { next = k; break; }
      }
      var label = next === (todayKey + 1) % 7 ? 'tomorrow' : names[next];
      statusEl.innerHTML = '<span style="color:#FFD97A;">Closed</span>&nbsp;· opens ' + label + ' at ' + fmt(hours[next].open);
    }
  }

  // Reveal on scroll (staggered per section)
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(function (el, i) { io.observe(el); });

  // Count-up stats
  var counters = document.querySelectorAll('[data-count]');
  if (counters.length) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        cio.unobserve(e.target);
        var el = e.target;
        var target = parseFloat(el.getAttribute('data-count'));
        var suffix = el.getAttribute('data-suffix') || '';
        var decimals = (String(target).split('.')[1] || '').length;
        var start = null;
        var dur = 1400;
        var step = function (ts) {
          if (!start) start = ts;
          var p = Math.min((ts - start) / dur, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = (target * eased).toFixed(decimals) + suffix;
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { cio.observe(el); });
  }
})();
