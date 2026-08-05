// Vibrant V4 — shared behavior (guards let any page use any subset)
(function () {
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  // Hero video — source appended after paint so the poster shows instantly
  var hv = document.querySelector('.hero video');
  if (hv && !hv.querySelector('source')) {
    var src = document.createElement('source');
    src.src = hv.getAttribute('data-src') || 'img/hero.mp4';
    src.type = 'video/mp4';
    hv.appendChild(src);
    hv.load();
  }

  // Nav
  var nav = document.getElementById('nav');
  if (nav && !nav.classList.contains('solid')) {
    var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 30); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', function () { links.classList.toggle('open'); });
    links.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { links.classList.remove('open'); }); });
  }

  // Hours: Mon 9–5:30 · Tue–Thu 8:30–6 · Fri–Sun closed
  var hours = { 1: ['09:00', '17:30'], 2: ['08:30', '18:00'], 3: ['08:30', '18:00'], 4: ['08:30', '18:00'] };
  var now = new Date();
  var d = now.getDay();
  var todayLi = document.querySelector('.visit-col li[data-day="' + d + '"]') || (d === 0 || d >= 5 ? document.querySelector('.visit-col li[data-day="5"]') : null);
  if (todayLi) todayLi.classList.add('today');

  var statusEl = document.getElementById('open-status');
  if (statusEl) {
    var toMin = function (t) { var p = t.split(':'); return (+p[0]) * 60 + (+p[1]); };
    var fmt = function (t) {
      var p = t.split(':'); var h = +p[0]; var ampm = h >= 12 ? 'PM' : 'AM';
      return (((h + 11) % 12) + 1) + (p[1] === '00' ? '' : ':' + p[1]) + ' ' + ampm;
    };
    var nowMin = now.getHours() * 60 + now.getMinutes();
    if (hours[d] && nowMin >= toMin(hours[d][0]) && nowMin < toMin(hours[d][1])) {
      statusEl.textContent = 'Open now · until ' + fmt(hours[d][1]);
    } else {
      var names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      var next = null;
      for (var i = 1; i <= 7; i++) { var k = (d + i) % 7; if (hours[k]) { next = k; break; } }
      statusEl.textContent = 'Closed · opens ' + (next === (d + 1) % 7 ? 'tomorrow' : names[next]) + ' at ' + fmt(hours[next][0]);
      statusEl.classList.add('closed');
    }
  }

  // Reveal on scroll
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: .12 });
  document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });

  // Testimonial rotator
  var quotes = Array.prototype.slice.call(document.querySelectorAll('.quote'));
  var dotsWrap = document.getElementById('quoteDots');
  if (quotes.length && dotsWrap) {
    var qi = 0, timer;
    quotes.forEach(function (_, i) {
      var b = document.createElement('button');
      b.setAttribute('aria-label', 'Testimonial ' + (i + 1));
      if (i === 0) b.classList.add('active');
      b.addEventListener('click', function () { show(i); restart(); });
      dotsWrap.appendChild(b);
    });
    var dots = Array.prototype.slice.call(dotsWrap.children);
    var show = function (i) {
      qi = i;
      quotes.forEach(function (q, j) { q.classList.toggle('active', j === i); });
      dots.forEach(function (d2, j) { d2.classList.toggle('active', j === i); });
    };
    var restart = function () { clearInterval(timer); timer = setInterval(function () { show((qi + 1) % quotes.length); }, 6500); };
    restart();
  }
})();
