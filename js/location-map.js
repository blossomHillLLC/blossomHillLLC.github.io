window.BH_PLACES=[["health", "M Health Fairview Woodwinds Hospital", "1925 Woodwinds Dr", 44.92239, -92.97657], ["health", "M Health Fairview Clinic - Woodwinds", "1825 Woodwinds Dr", 44.92287, -92.97457], ["health", "Allina Health Woodbury Clinic", "8675 Valley Creek Rd", 44.91865, -92.93007], ["health", "HealthPartners Clinic Woodbury", "8450 Seasons Pkwy", 44.93635, -92.93531], ["pharmacy", "Walgreens", "1615 Queens Dr", 44.9252, -92.9586], ["pharmacy", "CVS Pharmacy", "7200 Valley Creek Plaza", 44.92649, -92.95852], ["pharmacy", "Walgreens", "1965 Donegal Dr", 44.92062, -92.93002], ["parks", "Carver Lake Park & Beach", "3175 Century Ave S", 44.90378, -92.97903], ["parks", "Ojibway Park", "2695 Ojibway Dr", 44.91006, -92.95764], ["parks", "Woodbury Central Park", "8595 Central Park Pl", 44.91658, -92.93259], ["shopping", "Jerry's Foods", "7760 Hargis Pkwy", 44.88834, -92.94843], ["shopping", "Woodbury Village Shopping Center", "7250 Valley Creek Plaza", 44.92531, -92.96143], ["shopping", "Lunds & Byerlys", "7050 Valley Creek Plaza", 44.92655, -92.96367], ["shopping", "Kowalski's Market", "8505 Valley Creek Rd", 44.91797, -92.93273], ["shopping", "Tamarack Village", "Woodbury", 44.9416, -92.93781], ["shopping", "Woodbury Lakes", "9120 Hudson Rd", 44.94764, -92.92463], ["dining", "Northern Taphouse", "7325 Currell Blvd", 44.92497, -92.9576], ["dining", "Southern Social", "1424 Weir Dr", 44.92822, -92.96889], ["community", "New Life Church", "6758 Bailey Rd", 44.8938, -92.97095], ["community", "Woodbury Lutheran Valley Creek", "7380 Afton Rd", 44.92368, -92.95691], ["community", "Five Oaks Church", "4416 Radio Dr", 44.8846, -92.94608], ["community", "R.H. Stafford Library", "8595 Central Park Pl", 44.91658, -92.93197], ["community", "Darul Iman Masjid", "291 McKnight Rd S, St. Paul", 44.93249, -93.00542], ["community", "River Valley Church", "7805 Hudson Rd", 44.9462, -92.9462], ["community", "Eastern Twin Cities Islamic Center", "12585 Hudson Rd S, Afton", 44.94475, -92.85201]];window.BH_COLORS={"health": "#e4572e", "pharmacy": "#8e44ad", "parks": "#2e9e5b", "shopping": "#f2a541", "dining": "#d1495b", "community": "#2b7bb9"};
(function () {
  var box = document.getElementById('nb-map');
  if (!box) return;
  var HOME = [44.9042551, -92.9685426];
  var map, markers = [], started = false;

  function addFile(tag, attrs, cb) {
    var el = document.createElement(tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (cb) el.onload = cb;
    document.head.appendChild(el);
  }

  function build() {
    var L = window.L;
    box.innerHTML = '';
    map = L.map(box, { scrollWheelZoom: false }).setView(HOME, 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    var homeIcon = L.divIcon({ className: 'nb-home', html: '<span></span>', iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30] });
    L.marker(HOME, { icon: homeIcon, zIndexOffset: 1000, title: 'Blossom Hill' }).addTo(map)
      .bindPopup('<strong>Blossom Hill Assisted Living</strong><br>6765 Buckingham Road, Woodbury');

    var bounds = [HOME];
    window.BH_PLACES.forEach(function (p, i) {
      var m = L.circleMarker([p[3], p[4]], {
        radius: 8, weight: 2, color: '#fff', fillColor: window.BH_COLORS[p[0]], fillOpacity: 1
      }).addTo(map).bindPopup('<strong>' + p[1] + '</strong><br>' + p[2] +
        '<br><a href="https://www.google.com/maps/dir/?api=1&origin=6765+Buckingham+Rd+Woodbury+MN&destination=' +
        encodeURIComponent(p[1] + ', ' + p[2] + ', MN') + '" target="_blank" rel="noopener">Directions</a>');
      m.cat = p[0];
      markers[i] = m;
      bounds.push([p[3], p[4]]);
    });
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    showCat(document.querySelector('.nb-cat[open]'));
  }

  function showCat(det) {
    if (!map) return;
    var cat = det ? det.getAttribute('data-cat') : null;
    markers.forEach(function (m) {
      var on = !cat || m.cat === cat;
      m.setStyle({ fillOpacity: on ? 1 : 0.25, opacity: on ? 1 : 0.4 });
      if (on) m.bringToFront();
    });
  }

  function start() {
    if (started) return;
    started = true;
    if (location.protocol === 'file:') {
      box.querySelector('.nb-fallback').textContent = 'The map appears once the website is published. Open Blossom Hill in Google Maps';
      return;
    }
    addFile('link', { rel: 'stylesheet', href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', crossorigin: '' });
    addFile('script', { src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', crossorigin: '' }, build);
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (e) {
      if (e[0].isIntersecting) { io.disconnect(); start(); }
    }, { rootMargin: '300px' });
    io.observe(box);
  } else { start(); }

  document.querySelectorAll('.nb-cat').forEach(function (det) {
    det.addEventListener('toggle', function () {
      if (det.open) {
        document.querySelectorAll('.nb-cat').forEach(function (o) { if (o !== det) o.open = false; });
        showCat(det);
      } else if (!document.querySelector('.nb-cat[open]')) { showCat(null); }
    });
  });

  document.querySelectorAll('.nb-place').forEach(function (b) {
    b.addEventListener('click', function () {
      var m = markers[+b.getAttribute('data-i')];
      if (!m) { start(); return; }
      map.setView(m.getLatLng(), 14);
      m.openPopup();
      if (window.innerWidth < 992) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
})();
