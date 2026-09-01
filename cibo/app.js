/* ==========================================================================
   Cibo Fort Myers
   Small, dependency free behaviour: live opening status, menu filtering,
   scroll reveals, mobile navigation.
   ========================================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------ hours ---- */
  /* Sunday index 0. Service starts at 16:00 every night and runs to 21:00,
     except Friday and Saturday which run to 22:00.                          */
  var SERVICE = [
    { open: 16, close: 21 }, // Sun
    { open: 16, close: 21 }, // Mon
    { open: 16, close: 21 }, // Tue
    { open: 16, close: 21 }, // Wed
    { open: 16, close: 21 }, // Thu
    { open: 16, close: 22 }, // Fri
    { open: 16, close: 22 }  // Sat
  ];

  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /* Read the wall clock in Fort Myers, whatever the visitor's own zone is. */
  function restaurantNow() {
    var parts;
    try {
      parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false
      }).formatToParts(new Date());
    } catch (e) {
      var local = new Date();
      return { day: local.getDay(), minutes: local.getHours() * 60 + local.getMinutes() };
    }

    var lookup = {}, i;
    for (i = 0; i < parts.length; i++) lookup[parts[i].type] = parts[i].value;

    var shortDays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    var hour = parseInt(lookup.hour, 10);
    if (hour === 24) hour = 0; // some engines report midnight as 24

    return {
      day: shortDays[lookup.weekday],
      minutes: hour * 60 + parseInt(lookup.minute, 10)
    };
  }

  function label(hour24) {
    var suffix = hour24 >= 12 ? 'pm' : 'am';
    var h = hour24 % 12;
    if (h === 0) h = 12;
    return h + ':00' + suffix;
  }

  function paintStatus() {
    var pill = document.getElementById('statusPill');
    var text = document.getElementById('statusText');
    if (!pill || !text) return;

    var now = restaurantNow();
    var today = SERVICE[now.day];
    var openAt = today.open * 60;
    var closeAt = today.close * 60;

    pill.classList.remove('is-open', 'is-closed');

    if (now.minutes >= openAt && now.minutes < closeAt) {
      pill.classList.add('is-open');
      text.textContent = 'Open now until ' + label(today.close);
    } else if (now.minutes < openAt) {
      pill.classList.add('is-closed');
      text.textContent = 'Opens today at ' + label(today.open);
    } else {
      pill.classList.add('is-closed');
      var next = SERVICE[(now.day + 1) % 7];
      text.textContent = 'Closed. Opens tomorrow at ' + label(next.open);
    }

    /* tonight's line in the essentials strip */
    var tonight = document.getElementById('tonightHours');
    var note = document.getElementById('tonightNote');
    if (tonight) tonight.textContent = label(today.open) + ' to ' + label(today.close);
    if (note) note.textContent = DAY_NAMES[now.day] + ' dinner service';

    /* mark today in the hours table */
    var rows = document.querySelectorAll('#hoursBody tr');
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.toggle('is-today', Number(rows[i].getAttribute('data-day')) === now.day);
    }
  }

  paintStatus();
  setInterval(paintStatus, 60000);

  /* -------------------------------------------------------------- nav ---- */
  var nav = document.getElementById('nav');
  var toggle = document.getElementById('navtoggle');
  var links = document.getElementById('navlinks');

  function onScroll() {
    if (nav) nav.classList.toggle('is-stuck', window.scrollY > 40);
    var bar = document.getElementById('callbar');
    if (bar) bar.classList.toggle('is-up', window.scrollY > window.innerHeight * 0.6);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
  }
  if (links && nav) {
    links.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('is-open');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* highlight the section you are reading */
  var navAnchors = links ? links.querySelectorAll('a') : [];
  if (navAnchors.length && 'IntersectionObserver' in window) {
    var sections = [];
    for (var a = 0; a < navAnchors.length; a++) {
      /* only same page anchors are spied on; links to another page
         (menu.html, index.html#bar) are not valid selectors */
      var href = navAnchors[a].getAttribute('href') || '';
      if (href.charAt(0) !== '#' || href.length < 2) continue;
      var el = document.querySelector(href);
      if (el) sections.push({ el: el, link: navAnchors[a] });
    }
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var match = sections.filter(function (s) { return s.el === entry.target; })[0];
        if (match && entry.isIntersecting) {
          for (var n = 0; n < navAnchors.length; n++) navAnchors[n].classList.remove('is-active');
          match.link.classList.add('is-active');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { spy.observe(s.el); });
  }

  /* ------------------------------------------------------------- menu ---- */
  var tabs = document.querySelectorAll('.tab');
  var chips = document.querySelectorAll('.chip');
  var searchInput = document.getElementById('menuSearch');
  var courses = document.querySelectorAll('.course');
  var emptyState = document.getElementById('menuEmpty');

  var state = { course: 'all', filters: [], query: '' };

  function applyMenu() {
    var anyVisible = false;

    for (var c = 0; c < courses.length; c++) {
      var course = courses[c];
      var courseMatches = state.course === 'all' || course.getAttribute('data-course') === state.course;
      var dishes = course.querySelectorAll('.dish');
      var visibleInCourse = 0;

      for (var d = 0; d < dishes.length; d++) {
        var dish = dishes[d];
        var show = courseMatches;

        if (show) {
          for (var f = 0; f < state.filters.length; f++) {
            if (!dish.hasAttribute('data-' + state.filters[f])) { show = false; break; }
          }
        }

        if (show && state.query) {
          show = dish.textContent.toLowerCase().indexOf(state.query) !== -1;
        }

        dish.hidden = !show;
        if (show) visibleInCourse++;
      }

      course.hidden = visibleInCourse === 0;
      if (visibleInCourse > 0) anyVisible = true;
    }

    if (emptyState) emptyState.hidden = anyVisible;
  }

  for (var t = 0; t < tabs.length; t++) {
    tabs[t].addEventListener('click', function () {
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('is-active');
        tabs[i].setAttribute('aria-selected', 'false');
      }
      this.classList.add('is-active');
      this.setAttribute('aria-selected', 'true');
      state.course = this.getAttribute('data-course');
      applyMenu();
    });
  }

  for (var p = 0; p < chips.length; p++) {
    chips[p].addEventListener('click', function () {
      var key = this.getAttribute('data-filter');
      var on = this.classList.toggle('is-on');
      this.setAttribute('aria-pressed', String(on));
      if (on) {
        state.filters.push(key);
      } else {
        state.filters = state.filters.filter(function (k) { return k !== key; });
      }
      applyMenu();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      state.query = this.value.trim().toLowerCase();
      applyMenu();
    });
  }

  /* ---------------------------------------------------------- reveals ---- */
  var revealables = document.querySelectorAll('.reveal');

  if (reduceMotion || !('IntersectionObserver' in window)) {
    for (var r = 0; r < revealables.length; r++) revealables[r].classList.add('is-in');
  } else {
    var io = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    for (var v = 0; v < revealables.length; v++) io.observe(revealables[v]);
  }

  /* ---------------------------------------------------------- trivia ---- */
  var yr = document.getElementById('yr');
  if (yr) yr.textContent = String(new Date().getFullYear());
})();
