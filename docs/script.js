(function() {
    const slides = document.querySelectorAll('.slide');
    let currentSlide = 0;
    let isScrolling = false;
    let scrollTimeout = null;

    // Update body background to match current slide
    function updateBodyBackground(index) {
        const slide = slides[index];
        if (!slide) return;
        
        const computedStyle = window.getComputedStyle(slide);
        const bg = computedStyle.background || computedStyle.backgroundColor;
        document.body.style.background = bg;
    }

    function goToSlide(index) {
        if (index < 0) index = 0;
        if (index >= slides.length) index = slides.length - 1;
        currentSlide = index;
        slides[currentSlide].scrollIntoView({ behavior: 'smooth' });
        updateBodyBackground(currentSlide);
    }

    // Initialize background on load
    updateBodyBackground(0);

    // Handle wheel events for flipbook behavior
    document.addEventListener('wheel', function(e) {
        e.preventDefault();
        
        if (isScrolling) return;
        
        isScrolling = true;
        
        if (e.deltaY > 0) {
            // Scroll down - next slide
            goToSlide(currentSlide + 1);
        } else if (e.deltaY < 0) {
            // Scroll up - previous slide
            goToSlide(currentSlide - 1);
        }
        
        // Debounce to prevent multiple triggers
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(function() {
            isScrolling = false;
        }, 800);
    }, { passive: false });

    // Handle keyboard navigation
    document.addEventListener('keydown', function(e) {
        if (isScrolling) return;
        
        if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
            e.preventDefault();
            isScrolling = true;
            goToSlide(currentSlide + 1);
            setTimeout(function() { isScrolling = false; }, 800);
        } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
            e.preventDefault();
            isScrolling = true;
            goToSlide(currentSlide - 1);
            setTimeout(function() { isScrolling = false; }, 800);
        } else if (e.key === 'Home') {
            e.preventDefault();
            isScrolling = true;
            goToSlide(0);
            setTimeout(function() { isScrolling = false; }, 800);
        } else if (e.key === 'End') {
            e.preventDefault();
            isScrolling = true;
            goToSlide(slides.length - 1);
            setTimeout(function() { isScrolling = false; }, 800);
        }
    });

    // Handle touch events for mobile
    let touchStartY = 0;
    let touchEndY = 0;

    document.addEventListener('touchstart', function(e) {
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.addEventListener('touchend', function(e) {
        if (isScrolling) return;
        
        touchEndY = e.changedTouches[0].screenY;
        const diff = touchStartY - touchEndY;
        
        if (Math.abs(diff) > 30) { // Minimum swipe distance
            isScrolling = true;
            if (diff > 0) {
                // Swipe up - next slide
                goToSlide(currentSlide + 1);
            } else {
                // Swipe down - previous slide
                goToSlide(currentSlide - 1);
            }
            setTimeout(function() { isScrolling = false; }, 800);
        }
    }, { passive: true });

    // Update current slide on scroll end (for edge cases)
    let scrollEndTimeout = null;
    window.addEventListener('scroll', function() {
        clearTimeout(scrollEndTimeout);
        scrollEndTimeout = setTimeout(function() {
            // Find which slide is most visible
            const viewportCenter = window.scrollY + window.innerHeight / 2;
            let closestSlide = 0;
            let closestDistance = Infinity;
            
            slides.forEach(function(slide, index) {
                const slideCenter = slide.offsetTop + slide.offsetHeight / 2;
                const distance = Math.abs(viewportCenter - slideCenter);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestSlide = index;
                }
            });
            
            currentSlide = closestSlide;
            updateBodyBackground(currentSlide);
        }, 100);
    }, { passive: true });
})();