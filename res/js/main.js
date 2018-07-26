window.onload = function() {
    var s, m, p, n, 
        yearStart, yearEnd;
    var currentCategory = 0;

    var loadPaths = [
        // map TopoJSON
        "res/data/cro_regv3.json",

        // datasets
        "res/data/dataset_broadband.json",

        // county names
        "res/data/data_names.json"
    ];

    loadAll();


    /******************
    *    functions    *
    ******************/
    function resizeHandler() {
        console.log("resized.");
        m.resize();
        p.resize();
    }

    function yearChangeHandler(year) {
        console.log("tick, year "+year+"!");
        m.show(currentCategory, year, yearStart, yearEnd);
    }

    function categoryChangeHandler(idx) {
        currentCategory = idx;

        p.resetProgress();
        m.show(currentCategory, yearStart, yearStart, yearEnd);
    }

    function loadAll() {
        var q = queue();

        for (var i = 0; i < loadPaths.length; i++)
            q.defer(d3.json, loadPaths[i]);

        q.awaitAll(loadingFinished);
    }

    function loadingFinished(error, results) {
        // topology data
        var topology = results[0];
        var topologyData = topojson
            .feature(topology, topology.objects.layer1)
            .features;
        
        // county data
        var countyData = new Array();
        
        // this will allow us to use
        //  countyData[category].values[county][year]
        //  syntax.
        for (var i = 1; i < results.length - 1; i++) {
            var categoryRaw = results[i];
            var category = {
                title: categoryRaw.title,
                description: categoryRaw.description,
                shortTitle: categoryRaw.shortTitle,
                values: new Array()
            };
            
            var counties = categoryRaw.values;

            for (var j = 0; j < counties.length; j++) {
                var years = counties[j];
                var county = new Array();
                
                for (var k = 0; k < years.length; k++) {
                    var y = years[k];
                    county[y.year] = y.value;
                }

                category.values.push(county);
            }

            countyData.push(category);
        }
        
        // values array from zeroth category, zeroth county.
        // assuming all datasets will have the same timespan.
        var yC0C0 = results[1].values[0];
        yearStart = yC0C0[0].year;
        yearEnd = yC0C0[yC0C0.length - 1].year;

        // county names
        var countyNames = results[results.length - 1].names;

        s = new SidebarData(countyData, countyNames);
        m = new InteractiveMap(topologyData, countyData, countyNames,
            s.displayDataForCounty);

        p = new Progress(yearStart, yearEnd, yearChangeHandler);
        n = new Navbar(categoryChangeHandler);
        
        // registering the onresize handler before instantiating object above 
        //  would result in resize events triggering methods of nonexistent 
        //  objects
        window.onresize = resizeHandler;
    }
}


function Navbar(externalCategoryChangeHandler) {
    var tabs = d3.selectAll("nav li");
    tabs.on("click", tabClickHandler);

    var activeCategory;

    setActiveCategory(0);

    function setActiveCategory(idx) {
        activeCategory = idx;

        setActiveTab(idx);
        externalCategoryChangeHandler(idx);
    }

    function setActiveTab(idx) {
        // flush other tabs' active state
        tabs.attr({class: null});

        var currentTab = d3.select(tabs[0][idx]);
        currentTab.attr({class: "active"});
    }

    function tabClickHandler(d) {
        var clickedTab = d3.select(this);
        var clickedTabIdx = clickedTab.attr("id");

        trySetActiveCategory(clickedTabIdx);
    }

    function trySetActiveCategory(idx) {
        if (activeCategory != idx) {
            setActiveCategory(idx);
        }
    }

}


function SidebarData(countyData, countyNames) {
    this.displayDataForCounty = function (county) {
        console.log("displaying data for county " + county);
    }
}


function InteractiveMap(topology, counties, names, externalRegionClickHandler) {
    /******************
    *    constants    *
    ******************/
    var colorLowest = "#a8d1df",
        colorHighest = "#0078a1",
        tooltipXYSpacing = 8;

    
    var topologyData = topology,
        countyData = counties,
        countyNames = names;

    var tooltipContainer = d3.select("#tooltip"),
        tooltipCountyName = d3.select("#tooltip #county"),
        tooltipDataName = d3.select("#tooltip #data #name"),
        tooltipDataValue = d3.select("#tooltip #data #value");
    
    var scaleMin = 0, 
        scaleMax,
        colorScale;

    var currentCategory,
        currentYear,
        currentCounty,
        currentCountyDomSelection,
        currentSelectedCounty = null;
    
    var alreadyDrawn = false,
        tooltipVisible = false;
    
    var colorInterpolator = d3.interpolate(colorLowest, colorHighest);

    var mapContainer = d3.select("#map");
    var map = mapContainer.append("g");

    var counties;

    var projection = d3.geo.mercator()
        .center([0, 10])
        .rotate([-180, 0]);

    var path = d3.geo.path()
        .projection(projection);


    /****************
    *    methods    *
    ****************/
    this.show = function (category, year, start, end) {
        tryDrawMap();
        paintMap(category, year, start, end);
        tryUpdateTooltipText();
    }

    this.resize = function () {
        adjustScaleAndPosition();
    }

    
    /******************
    *    functions    *
    ******************/
    function paintMap(category, year, start, end) {
        if (currentCategory !== category) {
            var data = new Array();
            var values = countyData[category].values;

            for (var i = 0; i < values.length; i++) {
                for (var j = start; j <= end; j++) {
                    data.push(values[i][j]);
                }
            }

            scaleMax = d3.max(data);

            colorScale = d3.scale.linear()
                .domain([scaleMin, scaleMax])
                .nice();

            currentCategory = category;
        }
        
        counties.attr({
            fill: function(d, county) { 
                return colorInterpolator(
                    colorScale(countyData[category].values[county][year])
                );
            }
        });

        currentYear = year;
    }

    function tryDrawMap() {
        if (!alreadyDrawn) {
            hideTooltip();

            drawMap();

            alreadyDrawn = true;
        }
    }

    function drawMap() {
        counties = map
            .selectAll("path")
            .data(topologyData)
            .enter()
            .append("path")
                .attr({
                    class: "county",
                    d: path
                })
                .on("mouseenter", regionMouseEnterHandler)
                .on("mousemove", regionMouseMoveHandler)
                .on("mouseleave", regionMouseLeaveHandler)
                .on("click", regionClickHandler);
        
        adjustScaleAndPosition();
    }

    function tryUpdateTooltipText() {
        if (tooltipVisible) {
            updateTooltipText();
        }
    }

    function regionMouseEnterHandler(d, county) {
        setTooltipPosition(
            d3.event.clientX, 
            d3.event.clientY
        );

        currentCounty = county;

        updateTooltipText();
    }

    function regionMouseMoveHandler() {
        setTooltipPosition(
            d3.event.clientX, 
            d3.event.clientY
        );
    }

    function regionMouseLeaveHandler() {
        hideTooltip();
    }

    function setTooltipPosition(x, y) {
        tooltipContainer.style({
            left: x + tooltipXYSpacing,
            top: y + tooltipXYSpacing,
            display: "block"
        });

        tooltipVisible = true;
    }

    function hideTooltip() {
        tooltipContainer.attr({
            style: null
        });

        tooltipVisible = false;
    }

    function updateTooltipText() {
        var countyName = countyNames[currentCounty],
            dataName = countyData[currentCategory].shortTitle,
            dataValue = 
                countyData[currentCategory].values[currentCounty][currentYear];

        tooltipCountyName.html(countyName);
        tooltipDataName.html(dataName + ":");
        tooltipDataValue.html(dataValue);
    }

    function adjustScaleAndPosition() {
        // flush leftovers from last viewport size
        map.attr({
            transform: null
        });
        
        var mapContainerClientRect = 
                mapContainer.node().getBoundingClientRect(),
            mapClientRect = 
                map.node().getBoundingClientRect();
        
        var padding = 0.05 * min(mapContainerClientRect.width, 
                mapContainerClientRect.height);
        
        
        var width = mapClientRect.width,
            containerWidth = mapContainerClientRect.width,
            targetWidth = containerWidth - padding * 2,
            widthRatio = targetWidth/width;

        var height = mapClientRect.height,
            containerHeight = mapContainerClientRect.height,
            targetHeight = containerHeight - padding * 2,
            heightRatio = targetHeight/height;

        var ratio = min(widthRatio, heightRatio);
        
        // set ratio to 0 in case it gets below zero to prevent map being 
        //  flipped
        ratio = ratio < 0 ? 0 : ratio;

        map.attr({
            transform: "scale("+ratio+")"
        });

        // update map group client rectangle after resizing as it now has 
        //  new dimensions
        mapClientRect = map.node().getBoundingClientRect();

        var actualX = mapClientRect.x;
        var expectedX = mapContainerClientRect.width / 2
             - mapClientRect.width / 2;
        var diffX = expectedX - actualX;

        // map svg container starts from x = 0, so there is not much to 
        //  deal with. however, the starting y coordinate is a bit tricky 
        //  as above the map container is navbar. to compute the center y 
        //  coordinate, we need to factor in the navbar height.
        var actualAbsoluteY = mapClientRect.y;
        var actualRelativeY = actualAbsoluteY - mapContainerClientRect.y;
        var expectedRelativeY = mapContainerClientRect.height / 2
             - mapClientRect.height / 2;
        var diffY = expectedRelativeY - actualRelativeY;

        map.attr({
            // translate, and then scale. any other order results in map 
            //  *not* being centered.
            transform: "translate("+diffX+", "+diffY+") scale("+ratio+")"
        });
    }

    function min(a, b) {
        if (a < b)
            return a;
        else
            return b;
    }

    function regionClickHandler(d, county) {
        var newRegionSelected = false;
        var domObjSelected = d3.select(this);

        if (currentSelectedCounty == null) {
            console.log("last region did not exist");
            domObjSelected.attr({
                id: "selected"
            });

            currentSelectedCounty = county;
            currentCountyDomSelection = domObjSelected;
            newRegionSelected = true;
        }
        else if (currentSelectedCounty != county) {
            console.log("last region different than this one");
            currentCountyDomSelection.attr({
                id: null
            });

            domObjSelected.attr({
                id: "selected"
            });

            currentSelectedCounty = county;
            currentCountyDomSelection = domObjSelected;
            newRegionSelected = true;
        }

        if (newRegionSelected)
            externalRegionClickHandler(county);
    }
}


function Progress(start, end, externalYearChangeHandler) {
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
    var yearStart = start,
        yearEnd = end;
    
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

   
    /****************
    *    methods    *
    ****************/
    this.resetProgress = function () {
        if (animRunning)
            stopAnim();
        setCurrentYear(yearStart);
    }

    this.resize = function () {
        windowResizeHandler();
    }

    
    /******************
    *    functions    *
    ******************/
    function windowResizeHandler() {
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
        expandProgressHandle();
        dragStopAnim();

        // firefox does not cope well with using
        //  d3.event.sourceEvent.offsetX
        //  for quick successive dragstart events (read: every second 
        //  dragstart event has a completely wrong offsetX value).
        // to mitigate that, a different method (which works fairly well in 
        //  chrome as well) is used to compute mouse coordinates.
        var dragStartClientMouseX = d3.event.sourceEvent.clientX;
        var computedRelativeMouseX = 
            dragStartClientMouseX - progressBarContainerClientRect.x;
        handleDragEvent(computedRelativeMouseX);
    }

    function progressBarLineDrag() {
        progressHandleDrag();
    }

    function progressBarLineDragEnd() {
        shrinkProgressHandle();
        dragStartAnim();
    }

    function progressHandleDragStart() {
        expandProgressHandle();
        dragStopAnim();
    }

    function progressHandleDrag() {
        var mouseEventX = d3.event.x;
        handleDragEvent(mouseEventX);
    }

    function progressHandleDragEnd() {
        shrinkProgressHandle();
        dragStartAnim();
    }

    function dragStopAnim() {
        if (animRunning) {
            stopAnim();
            animInterruptedByDrag = true;
        }
    }

    function dragStartAnim() {
        if (animInterruptedByDrag) {
            // don't resume animation at yearEnd just to figure out after 
            //  tickDelay that the animation work is done
            if (currentYear < yearEnd)
                startAnim();
            
            animInterruptedByDrag = false;
        }
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
        setCurrentYear(year);

        externalYearChangeHandler(year);
    }

    function setCurrentYear(year) {
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
