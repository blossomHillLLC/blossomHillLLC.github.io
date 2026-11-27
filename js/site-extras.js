/* Blossom Hill - site extras (added Nov 2026)
   1. Google Analytics: loads a few seconds after the page is ready (or when the visitor
      scrolls or taps), so it never slows the page down.
   2. Counts the actions that bring in leads, so you can see them in Google Analytics:
        phone_call_click   - someone tapped a phone number
        email_click        - someone tapped an email address
        book_tour_click    - someone clicked a "Book a Tour" or "Schedule a Tour" button
        contact_form_sent  - the Contact page form was sent
        referral_form_sent - the case manager referral form was sent
        checklist_signup   - someone asked for the touring checklist
        job_application_sent - the Careers form was sent
   3. Sends the referral and checklist forms (see the pages for those forms).
   4. Shows the video tour on the Gallery page once a YouTube video number is added there. */
(function () {
    "use strict";
    var GA_ID = "G-BBGPPX550T";

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    gtag("js", new Date());
    gtag("config", GA_ID);

    var gaLoaded = false;
    function loadGA() {
        if (gaLoaded) return; gaLoaded = true;
        var s = document.createElement("script");
        s.async = true;
        s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
        document.head.appendChild(s);
    }
    ["scroll", "pointerdown", "keydown", "touchstart"].forEach(function (e) {
        window.addEventListener(e, loadGA, { once: true, passive: true });
    });
    if (document.readyState === "complete") setTimeout(loadGA, 3500);
    else window.addEventListener("load", function () { setTimeout(loadGA, 3500); });

    function track(name, extra) {
        try { gtag("event", name, extra || {}); } catch (e) {}
    }
    window.bhTrack = track;

    /* clicks on phone numbers, email addresses and tour buttons */
    document.addEventListener("click", function (e) {
        var a = e.target.closest ? e.target.closest("a") : null;
        if (!a) return;
        var href = a.getAttribute("href") || "";
        var where = { link_text: (a.textContent || "").trim().slice(0, 60), page: location.pathname };
        if (href.indexOf("tel:") === 0) track("phone_call_click", where);
        else if (href.indexOf("mailto:") === 0) track("email_click", where);
        else if (/tour/i.test(a.textContent || "")) track("book_tour_click", where);
    });

    /* existing forms: count them when they are sent */
    function watchForm(id, name) {
        var f = document.getElementById(id);
        if (f) f.addEventListener("submit", function () { if (f.checkValidity()) track(name, { page: location.pathname }); });
    }
    watchForm("contactForm", "contact_form_sent");
    watchForm("applyForm", "job_application_sent");

    /* referral form and checklist forms (class "bh-form") */
    document.querySelectorAll("form.bh-form").forEach(function (form) {
        form.addEventListener("invalid", function () { form.classList.add("was-validated"); }, true);
        form.addEventListener("submit", function (e) {
            e.preventDefault();
            if (!form.checkValidity()) { form.classList.add("was-validated"); return; }
            var btn = form.querySelector("button[type=submit]");
            if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = "Sending..."; }
            fetch(form.action, { method: "POST", body: new FormData(form), headers: { "Accept": "application/json" } })
                .then(function (r) {
                    if (!r.ok) throw new Error("not ok");
                    track(form.getAttribute("data-event") || "form_sent", { page: location.pathname });
                    var done = document.getElementById(form.getAttribute("data-done"));
                    form.style.display = "none";
                    if (done) done.hidden = false;
                })
                .catch(function () {
                    if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label; }
                    alert("Sorry, that did not send. Please try again or call 763-285-9666.");
                });
        });
    });

    /* Gallery video tour: shows only after a YouTube video number is filled in */
    var tour = document.getElementById("tour-video");
    if (tour) {
        var vid = (tour.getAttribute("data-youtube-id") || "").trim();
        if (vid) {
            tour.hidden = false;
            var btn = tour.querySelector(".yt-play");
            var thumb = tour.querySelector("img");
            if (thumb) thumb.src = "https://i.ytimg.com/vi/" + encodeURIComponent(vid) + "/hqdefault.jpg";
            if (btn) btn.addEventListener("click", function () {
                var box = tour.querySelector(".yt-box");
                box.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(vid) +
                    '?autoplay=1&rel=0" title="Blossom Hill video tour" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
                track("video_tour_play", { page: location.pathname });
            });
        }
    }
})();
