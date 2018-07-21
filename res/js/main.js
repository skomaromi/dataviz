window.onload = function() {
    /******************
    *    constants    *
    ******************/
    var progressBarPaddingX = 32,
        progressBarLineHeight = 5,
        progressBarAxisGroupTicksYOffset = 4,
        progressHandleRNormal = 5,
        progressHandleRLarge = 7,
        yStart = 8,
        
        tickDelay = 1000;
    
    var progressBarAxisGroupY = yStart + progressBarAxisGroupTicksYOffset;

    /***************
    *    main()    *
    ***************/
    // placeholder data, replace with actual start and end years 
    // fetched from the JSON file(s)
    var yearStart = 2004,
        yearEnd = 2018;
    
    var currentYear = yearStart;
    var currentYearIndicator = d3.select("#current-year");
    setCurrentYearIndicatorText(currentYear);
    
    var animRunning = false,
        animInterruptedByDrag = false;
    
    var fastBackwardButton = d3.select("#controls #fast-backward"),
        fastForwardButton = d3.select("#controls #fast-forward"),
        playButton = d3.select("#controls #play"),
        pauseButton = d3.select("#controls #pause");
    
    var tickable;
    
    playButton.on("click", startAnim);
    pauseButton.on("click", stopAnim);
    
    hidePauseButton();

    fastBackwardButton.on("click", fastBackwardButtonClick);
    fastForwardButton.on("click", fastForwardButtonClick);

    var progressBarContainer = d3.select("#progress-bar svg");
    var map = d3.select("#map");
    var progressHandleDragBehavior = d3.behavior
        .drag()
        .on("dragstart", progressHandleDragStart)
        .on("drag", progressHandleDrag)
        .on("dragend", progressHandleDragEnd);

    var mapClientRect = map
        .node()
        .getBoundingClientRect();
    
    var progressBarContainerClientRect = progressBarContainer
        .node()
        .getBoundingClientRect();
    
    var progressBarAreaXStart = 
        0;
    var progressBarAreaXEnd = 
        mapClientRect.width - progressBarContainerClientRect.x;
    
    var progressBarLineDragBehavior = d3.behavior
        .drag()
        .on("dragstart", progressBarLineDragStart)
        .on("drag", progressBarLineDrag)
        .on("dragend", progressBarLineDragEnd);
    
    var progressBarLineGroup = progressBarContainer
        .append("g")
        .attr({id: "lines"})
        .call(progressBarLineDragBehavior);

    var usableProgressBarAreaXStart = 
        progressBarAreaXStart + progressBarPaddingX;
    var usableProgressBarAreaXEnd = 
        progressBarAreaXEnd - progressBarPaddingX;
    
    var progressBarAxisScale = d3.scale.linear()
        .domain([yearStart, yearEnd])
        .range([
            usableProgressBarAreaXStart, 
            usableProgressBarAreaXEnd
        ]);
    
    var progressBarAxisSvg = d3.svg
        .axis()
        .tickFormat(d3.format("d"))
        .scale(progressBarAxisScale);

    var progressBarAxisGroup = makeProgressBarTicks();
    
    // initial progressBar draw
    var currentX = usableProgressBarAreaXStart;

    var progressBarLineElapsedXStart, progressBarLineElapsedXEnd, 
        progressBarLineElapsedWidth;
    updateProgressBarLineElapsedDimensions();

    var progressBarLineElapsed = progressBarLineGroup
        .append("rect")
        .attr({
            id: "elapsed",
            y: yStart,
            width: progressBarLineElapsedWidth,
            height: progressBarLineHeight
    });

    var progressBarLineRemainingXStart, progressBarLineRemainingXEnd, 
        progressBarLineRemainingWidth;
    updateProgressBarLineRemainingDimensions();

    var progressBarLineRemaining = progressBarLineGroup
        .append("rect")
        .attr({
            id: "remaining",
            x: progressBarLineRemainingXStart,
            y: yStart,
            width: progressBarLineRemainingWidth,
            height: progressBarLineHeight
    });

    var progressHandle = makeProgressHandle();

    
    /********************************************
    *    register window event handlers here    *
    ********************************************/
    window.onresize = windowResizeHandler;

    
    /******************
    *    functions    *
    ******************/
    function windowResizeHandler() {
        console.log("windowResizeHandler() called!");
        
        mapClientRect = map.node().getBoundingClientRect();
        progressBarContainerClientRect = progressBarContainer
            .node()
            .getBoundingClientRect();
        
        progressBarAreaXEnd = 
            mapClientRect.x 
                + mapClientRect.width 
                - progressBarContainerClientRect.x;

        //
        // resize axes, update scale
        //
        usableProgressBarAreaXStart = 
            progressBarAreaXStart + progressBarPaddingX;
        usableProgressBarAreaXEnd = 
            progressBarAreaXEnd - progressBarPaddingX;

        progressBarAxisScale.range([
            usableProgressBarAreaXStart, 
            usableProgressBarAreaXEnd
        ]);
        progressBarAxisSvg.scale(progressBarAxisScale);
        progressBarAxisGroup.remove();
        progressBarAxisGroup = makeProgressBarTicks();

        //
        // relocate progress handle
        //
        updateProgressHandleLocation(currentYear);
        
        //
        // resize progress bar line
        //
        updateProgressBarLineElapsedDimensions();
        progressBarLineElapsed.attr({
            width: progressBarLineElapsedWidth
        });

        updateProgressBarLineRemainingDimensions();
        progressBarLineRemaining.attr({
            x: currentX,
            width: progressBarLineRemainingWidth
        });
    }
    
    function makeProgressBarTicks() {
        return progressBarContainer
            .append("g")
            .attr({transform: "translate(0, "+progressBarAxisGroupY+")"})
            .call(progressBarAxisSvg);
    }

    function makeProgressHandle() {
        return progressBarContainer
            .append("circle")
            .attr({
                id: "handle",
                cx: currentX,
                cy: yStart + progressBarLineHeight / 2,
                r: progressHandleRNormal
            })
            .call(progressHandleDragBehavior);
    }
    
    function progressBarLineDragStart() {
        progressHandleDragStart();

        var mouseEventX = d3.event.sourceEvent.offsetX;
        handleDragEvent(mouseEventX);
    }

    function progressBarLineDrag() {
        progressHandleDrag();
    }

    function progressBarLineDragEnd() {
        progressHandleDragEnd();
    }

    function progressHandleDragStart() {
        expandProgressHandle();

        if (animRunning) {
            stopAnim();
            animInterruptedByDrag = true;
        }
    }

    function progressHandleDrag() {
        var mouseEventX = d3.event.x;
        handleDragEvent(mouseEventX);
    }

    function handleDragEvent(x) {
        var decodedYearFloat = progressBarAxisScale.invert(x);
        var decodedYear = Math.round(decodedYearFloat);

        if (decodedYear > yearEnd)
            decodedYear = yearEnd;
        else if (decodedYear < yearStart)
            decodedYear = yearStart;
        
        tryUpdateCurrentYear(decodedYear);
    }

    function tryUpdateCurrentYear(year) {
        if (currentYear != year) {
            updateCurrentYear(year);
        }
    }

    function updateCurrentYear(year) {
        currentYear = year;

        setCurrentYearIndicatorText(year);
        updateProgressHandleLocation(year);
        updateProgressLines(year);
    }

    function updateProgressLines(year) {
        updateProgressBarLineElapsedDimensions();
        progressBarLineElapsed
            .attr({
                width: progressBarLineElapsedWidth
            });
        
        updateProgressBarLineRemainingDimensions();
        progressBarLineRemaining
            .attr({
                x: currentX,
                width: progressBarLineRemainingWidth
            });
    }

    function updateProgressBarLineElapsedDimensions() {
        progressBarLineElapsedXStart = progressBarAreaXStart;
        progressBarLineElapsedXEnd = currentX;

        progressBarLineElapsedWidth = 
            progressBarLineElapsedXEnd - progressBarLineElapsedXStart;
    }

    function updateProgressBarLineRemainingDimensions() {        
        progressBarLineRemainingXStart = currentX
        progressBarLineRemainingXEnd = progressBarAreaXEnd;

        progressBarLineRemainingWidth = 
            progressBarLineRemainingXEnd - progressBarLineRemainingXStart;
    }

    function updateProgressHandleLocation(year) {
        currentX = progressBarAxisScale(year);

        progressHandle.attr({cx: currentX});
    }

    function progressHandleDragEnd() {
        shrinkProgressHandle();

        if (animInterruptedByDrag) {
            // don't resume animation at yearEnd just to figure out tickDelay 
            //  milliseconds later that animation work is done
            if (currentYear < yearEnd)
                startAnim();
            
            animInterruptedByDrag = false;
        }
    }

    function expandProgressHandle() {
        setProgressHandleSizeSmooth(progressHandleRLarge);
    }

    function shrinkProgressHandle() {
        setProgressHandleSizeSmooth(progressHandleRNormal);
    }

    function setProgressHandleSizeSmooth(r) {
        progressHandle
            .transition()
            .duration(100)
            .attr({
                r: r
            });
    }

    function fastBackwardButtonClick() {
        if (animRunning)
            stopAnim();
        updateCurrentYear(yearStart);
    }

    function fastForwardButtonClick() {
        if (animRunning)
            stopAnim();
        updateCurrentYear(yearEnd);
    }

    function stopAnim() {
        hidePauseButton();
        showPlayButton();

        animRunning = false;

        clearInterval(tickable);
    }

    function startAnim() {
        hidePlayButton();
        showPauseButton();

        // don't start over if animation reached end by dragging
        if (currentYear == yearEnd && !animInterruptedByDrag)
            updateCurrentYear(yearStart);

        animRunning = true;

        tickable = setInterval(tick, tickDelay);
    }

    function tick() {
        if (currentYear < yearEnd) {
            currentYear++;
            updateCurrentYear(currentYear);
        }
        else {
            stopAnim()
        }
    }

    function setCurrentYearIndicatorText(t) {
        currentYearIndicator.text(t);
    }

    function showPlayButton() {
        showElement(playButton);
    }

    function hidePlayButton() {
        hideElement(playButton);
    }

    function showPauseButton() {
        showElement(pauseButton);
    }

    function hidePauseButton() {
        hideElement(pauseButton);
    }

    function hideElement(el) {
        el.style({
            display: "none"
        });
    }

    function showElement(el) {
        el.attr({
            style: null
        });
    }
};
