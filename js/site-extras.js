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
    /* Phone and email safeguards for every form on the site.
       A phone box only accepts a real-looking 10-digit US number (for example 763-285-9666).
       An email box only accepts a real-looking address (for example name@example.com). */
    function phoneProblem(v) {
        var d = v.replace(/\D/g, "");
        if (d.length === 11 && d.charAt(0) === "1") d = d.slice(1);
        if (/[^0-9\s().+\-]/.test(v)) return "Please use only numbers in the phone box, for example 763-285-9666.";
        if (d.length !== 10) return "Please enter a 10-digit phone number, for example 763-285-9666.";
        if (/^[01]/.test(d) || /^\d{3}[01]/.test(d)) return "That does not look like a real phone number. Please check it.";
        if (/^(\d)\1{9}$/.test(d) || d === "1234567890" || d.slice(3, 6) === "555" && d.slice(6, 8) === "01") return "That does not look like a real phone number. Please check it.";
        return "";
    }
    function emailProblem(v) {
        if (!/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/.test(v) || /\.\./.test(v) || /^\.|\.@/.test(v))
            return "Please enter a real email address, for example name@example.com.";
        return "";
    }
    function guard(input, check) {
        function run() {
            var v = input.value.trim();
            input.setCustomValidity(v === "" ? (input.required ? (input.type === "email" ? "Please enter your email address." : "Please enter your phone number.") : "") : check(v));
        }
        input.addEventListener("input", run);
        input.addEventListener("blur", function () { input.value = input.value.trim(); run(); });
        run();
    }
    document.querySelectorAll('form input[type="tel"], form input[name="phone"]').forEach(function (i) { guard(i, phoneProblem); });
    document.querySelectorAll('form input[type="email"], form input[name="email"]').forEach(function (i) { guard(i, emailProblem); });

    /* Previewing the page from a file on your computer (not the real website)? YouTube refuses to
       play there (Error 153), so show a picture that opens the video on YouTube instead. */
    if (location.protocol === "file:") {
        document.querySelectorAll('iframe[src*="youtube"]').forEach(function (f) {
            var m = f.src.match(/embed\/([\w-]+)/); if (!m) return;
            var a = document.createElement("a");
            a.href = "https://www.youtube.com/watch?v=" + m[1]; a.target = "_blank"; a.rel = "noopener";
            a.className = "yt-play"; a.setAttribute("aria-label", "Watch the video tour on YouTube");
            a.innerHTML = '<img src="https://i.ytimg.com/vi/' + m[1] + '/hqdefault.jpg" alt=""><span></span>';
            f.replaceWith(a);
        });
    }
})();
