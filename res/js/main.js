window.onload = function() {
    /***************
    *    init()    *
    ***************/
    var s, m, p, n, 
        yearStart, yearEnd;
    var currentCategory = 0,
        currentCounty = null;

    var loadPaths = [
        // map TopoJSON
        "res/data/cro_regv3.json",

        // datasets
        "res/data/dataset_broadband.json",
        "res/data/dataset_industry.json",
        "res/data/dataset_tourism.json",
        "res/data/dataset_environment.json",

        // general county data
        "res/data/data_county.json"
    ];

    loadAll();


    /******************
    *    functions    *
    ******************/
    function resizeHandler() {
        m.resize();
        p.resize();
    }

    function yearChangeHandler(year) {
        m.show(currentCategory, year, yearStart, yearEnd);
    }

    function categoryChangeHandler(category) {
        currentCategory = category;

        p.resetProgress();
        m.show(currentCategory, yearStart, yearStart, yearEnd);
        s.show(currentCategory, currentCounty);
    }

    function countyChangeHandler(county) {
        currentCounty = county;

        s.show(currentCategory, currentCounty);
    }

    function unhideUi() {
        var body = d3.select("body");
        body
            // override CSS hide
            .style({opacity: 0})

            // remove CSS hide, inline styling remains (still hidden)
            .attr({class: null})
            
            // blur
            .style({filter: "blur(50px)"})

            // unhide
            .transition()
            .duration(1000)
            .style({
                opacity: 1,
                filter: "blur(0px)"
            })

            .transition()
            .attr({style: null});
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
        
        // category data
        var categoryData = [];
        
        // this will allow us to use
        //  categoryData[category].values[county][year]
        //  syntax.
        for (var i = 1; i < results.length - 1; i++) {
            var categoryRaw = results[i];
            var category = {
                title: categoryRaw.title,
                description: categoryRaw.description,
                tooltipText: categoryRaw.tooltipText,
                graphTitle: categoryRaw.graphTitle,
                values: []
            };
            
            var counties = categoryRaw.values;

            for (var j = 0; j < counties.length; j++) {
                var years = counties[j];
                var county = [];
                
                for (var k = 0; k < years.length; k++) {
                    var y = years[k];
                    county[y.year] = y.value;
                }

                category.values.push(county);
            }

            categoryData.push(category);
        }
        
        // values array from zeroth category, zeroth county
        // assuming all datasets will have the same timespan
        var yC0C0 = results[1].values[0];
        yearStart = yC0C0[0].year;
        yearEnd = yC0C0[yC0C0.length - 1].year;

        // county names
        var countyData = results[results.length - 1].counties;

        s = new Sidebar(categoryData, countyData, yearStart, yearEnd);
        m = new InteractiveMap(topologyData, categoryData, countyData,
            countyChangeHandler);

        p = new Progress(yearStart, yearEnd, yearChangeHandler);
        n = new Navbar(categoryChangeHandler);
        
        // registering the onresize handler before instantiating object above 
        //  would result in resize events triggering methods of nonexistent 
        //  objects
        window.onresize = resizeHandler;

        unhideUi();
    }
};


function Navbar(externalCategoryChangeHandler) {
    /***************
    *    init()    *
    ***************/
    var tabs = d3.selectAll("nav li");
    tabs.on("click", tabClickHandler);

    var activeCategory;

    setActiveCategory(0);


    /******************
    *    functions    *
    ******************/
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

    function tabClickHandler() {
        var clickedTab = d3.select(this);
        var clickedTabIdx = clickedTab.attr("id");

        trySetActiveCategory(clickedTabIdx);
    }

    function trySetActiveCategory(idx) {
        if (activeCategory !== idx) {
            setActiveCategory(idx);
        }
    }
}


function Sidebar(categories, counties, start, end) {
    /***************
    *    init()    *
    ***************/
    var categoryData = categories,
        countyData = counties,
        yearStart = start,
        yearEnd = end;
    
    var currentCategory,
        currentCounty = null;
    
    var categoryTitle = d3.select("aside .category #title"),
        categoryDescription = d3.select("aside .category #description"),
        countyDataArea = d3.select("aside .county #selected"),

        countyName = d3.select("aside .county .name"),
        countyArea = d3.select("aside .county #area"),
        countyPopulation = d3.select("aside .county #population"),
        countySeat = d3.select("aside .county #seat"),
        countyCities = d3.select("aside .county #cities"),
        countyMunicipalities = d3.select("aside .county #municipalities"),

        countyGraphsContainer = d3.select("aside .county #graphs"),
        countyNotSelectedMessage = d3.select("aside .county #not-selected");
    
    var graphs = null,
        graphObjs = [];
    
    d3.select("aside").on("scroll", scrollEventDispatcher);

    
    /****************
    *    methods    *
    ****************/
    this.show = function (category, county) {
        if (currentCategory !== category) {
            currentCategory = category;

            updateCategoryInfo();
        }

        updateCountySection(county);
    };


    /******************
    *    functions    *
    ******************/
    function updateCountySection(county) {
        if (currentCounty === null && county !== null) {
            hideNotSelectedMessage();
            currentCounty = county;
            
            populateCountySection();
            showCountyData();
        }
        else if (currentCounty !== null && county === null) {
            hideCountyData();
            showNotSelectedMessage();

            currentCounty = county;
        }
        else if (currentCounty !== county) {
            currentCounty = county;
            populateCountySection();
        }
    }

    function populateCountySection() {
        var county = countyData[currentCounty];
        countyName.html(county.name);
        countyArea.html(county.area);
        countyPopulation.html(county.population);
        countySeat.html(county.seat);
        countyCities.html(county.cities);
        countyMunicipalities.html(county.municipalities);

        if (graphs !== null) {
            graphs.remove();
            d3.selectAll(".graph-tooltip").remove();
            graphObjs = [];
        }

        graphs = countyGraphsContainer
            .selectAll("div")
            .data(categoryData)
            .enter()
            .append("div");
        
        graphs.append("h3").html(function (d) { return d.graphTitle; });

        var graphContainers = graphs
            .append("svg")
            .attr({
                class: "graph"
            });
    
        
        graphContainers.each(makeGraph);
    }

    function makeGraph(categoryData, categoryIdx) {
        var graphSvgContainer = d3.select(this);

        var tooltip = d3.select("body")
            .append("div")
            .attr({
                class: "graph-tooltip",
                id: categoryIdx
            });

        var graph = new SidebarGraph(
            categoryData, categoryIdx, currentCounty, graphSvgContainer, 
            tooltip, yearStart, yearEnd, graphHoverEventDispatcher
        );

        graphObjs.push(graph);
    }

    function graphHoverEventDispatcher(id, year) {
        for (var i = 0; i < graphObjs.length; i++) {
            if (i !== id)
                graphObjs[i].signalReceiver(year);
        }
    }

    function scrollEventDispatcher() {
        for (var i = 0; i < graphObjs.length; i++) {
            graphObjs[i].scrollHandler();
        }
    }

    function updateCategoryInfo() {
        var category = categoryData[currentCategory];
        categoryTitle.html(category.title);
        categoryDescription.html(category.description);
    }

    function showCountyData() {
        showElement(countyDataArea);
    }

    function hideCountyData() {
        hideElement(countyDataArea);
    }

    function showNotSelectedMessage() {
        showElement(countyNotSelectedMessage);
    }

    function hideNotSelectedMessage() {
        hideElement(countyNotSelectedMessage);
    }

    function showElement(el) {
        el.attr({class: null});
    }

    function hideElement(el) {
        el.attr({class: "hidden"});
    }
}

function SidebarGraph(_data, _category, _county, _svg, _tooltip, _start, _end,
    externalGraphHoverHandler) {
    /******************
    *    constants    *
    ******************/
    var cursorLineWidth = 2,
        cursorCircleRadius = 4,
        tooltipXSpacing = 8,
        padding = 10;
    
    
    /***************
    *    init()    *
    ***************/
    var data = _data,
        category = _category,
        county = _county,
        svg = _svg,
        tooltip = _tooltip,
        yearStart = _start,
        yearEnd = _end;
    
    var tooltipYear,
        tooltipValue;
    
    var svgWidth, svgHeight, xScale, yScale, line, cursorLine, cursorCircle, 
        currentYear = null, currentX, currentY;
    
    var tooltipVisible = false;

    draw();


    /****************
    *    methods    *
    ****************/
    this.signalReceiver = function (year) {
        if (currentYear === null && year !== null) {
            tryUpdateGraphIndicators(year);
            showGraphIndicators();
        }
        else if (currentYear !== null && year === null) {
            hideGraphIndicators();
        }
        else if (currentYear !== year) {
            tryUpdateGraphIndicators(year);
        }
    };

    this.scrollHandler = function () {
        if (tooltipVisible)
            setTooltipPosition();
    };


    /******************
    *    functions    *
    ******************/
    function draw() {
        makeGraph();

        svg
            .on("mouseenter", graphMouseEnter)
            .on("mousemove", graphMouseMove)
            .on("mouseleave", graphMouseLeave);
    }

    function makeTooltip() {
        var tooltipContainer = tooltip.append("div")
            .attr({ 
                class: "data-container" 
            });
        tooltipYear = tooltipContainer.append("span")
            .attr({
                class: "year"
            });
        
        tooltipValue = tooltipContainer.append("span")
            .attr({
                class: "value"
            });
        
        hideTooltip();
    }

    function makeGraph() {
        var svgClientRect = svg.node().getBoundingClientRect();

        svgWidth = svgClientRect.width;
        svgHeight = svgClientRect.height;

        var xStart = padding,
            xEnd = svgWidth - padding,
            yStart = svgHeight - padding,
            yEnd = padding;
        
        var values = data.values[county];
        var valuesUnsparsed = [];

        for (var i = 0; i < values.length; i++) {
            if (values[i] !== undefined)
                valuesUnsparsed.push(values[i]);
        }

        xScale = d3.scale.linear()
            .domain([yearStart, yearEnd])
            .range([xStart, xEnd]);
        
        yScale = d3.scale.linear()
            .domain([
                0,
                d3.max(values)
            ])
            .range([yStart, yEnd])
            .nice();

        line = d3.svg.line()
            .x(function (d, i) { return xScale(yearStart + i); })
            .y(function (d) { return yScale(d); });
        
        svg.append("path")
            .datum(valuesUnsparsed)
            .attr({
                class: "line",
                d: line
            });
        
        makeCursorLine();
        makeCursorCircle();
        makeTooltip();
    }

    function graphMouseEnter() {
        var event = d3.mouse(this);
        var mouseX = event[0];

        handleMouseEvent(mouseX);
        showGraphIndicators();
    }

    function graphMouseMove() {
        var event = d3.mouse(this);
        var mouseX = event[0];

        handleMouseEvent(mouseX);
    }

    function graphMouseLeave() {
        hideGraphIndicators();

        externalGraphHoverHandler(category, null);
    }

    function showGraphIndicators() {
        showCursorLine();
        showCursorCircle();
        showTooltip();
    }

    function hideGraphIndicators() {
        hideCursorLine();
        hideCursorCircle();
        hideTooltip();

        currentYear = null;
    }

    function handleMouseEvent(x) {
        var decodedYearFloat = xScale.invert(x);
        var decodedYear = Math.round(decodedYearFloat);

        if (decodedYear > yearEnd)
            decodedYear = yearEnd;
        else if (decodedYear < yearStart)
            decodedYear = yearStart;

        tryUpdateGraphIndicators(decodedYear);
    }

    function tryUpdateGraphIndicators(year) {
        if (currentYear !== year) {
            updateGraphIndicators(year);
        }
    }

    function updateGraphIndicators(year) {
        currentYear = year;
        currentX = xScale(year);
        currentY = yScale(data.values[county][year]);

        // cursor
        setCursorPosition();

        // tooltip
        updateTooltipText();
        setTooltipPosition();

        externalGraphHoverHandler(category, currentYear);
    }

    function setCursorPosition() {
        cursorLine.attr({
            x: cursorLineX()
        });

        cursorCircle.attr({
            cx: currentX,
            cy: currentY
        });
    }

    function makeCursorLine() {
        cursorLine = svg.append("rect")
            .attr({
                class: "cursor-line",
                width: cursorLineWidth,
                height: svgHeight
            });
        hideCursorLine();
    }

    function cursorLineX() {
        return currentX - cursorLineWidth / 2;
    }

    function makeCursorCircle() {
        cursorCircle = svg.append("circle")
            .attr({
                class: "cursor-circle",
                r: cursorCircleRadius
            });

        hideCursorCircle();
    }

    function updateTooltipText() {
        tooltipYear.text(currentYear);
        tooltipValue.text(data.values[county][currentYear]);
    }

    function setTooltipPosition() {
        var cursorCircleClientRect = cursorCircle.node()
            .getBoundingClientRect();
        
        
        if (!tooltipVisible)
            peekAtTooltipStart();

        var tooltipClientRect = tooltip.node().getBoundingClientRect();

        if (!tooltipVisible)
            peekAtTooltipEnd();

        var tooltipPositionLeft = cursorCircleClientRect.left - 
                tooltipClientRect.width - tooltipXSpacing,
            tooltipPositionTop = cursorCircleClientRect.top + 
                cursorCircleClientRect.height / 2 - 
                tooltipClientRect.height / 2;

        tooltip.style({
            left: tooltipPositionLeft + "px",
            top: tooltipPositionTop + "px"
        });
    }

    function showCursorLine() {
        cursorLine.attr({style: null});
    }

    function hideCursorLine() {
        cursorLine.style({visibility: "hidden"});
    }

    function showCursorCircle() {
        cursorCircle.attr({style: null});
    }

    function hideCursorCircle() {
        cursorCircle.style({visibility: "hidden"});
    }

    function showTooltip() {
        tooltip.style({
            display: null
        });
        tooltipVisible = true;
    }

    function hideTooltip() {
        tooltip.style({
            display: "none"
        });
        tooltipVisible = false;
    }

    function peekAtTooltipStart() {
        tooltip.style({
            visibility: "hidden",
            display: null
        });
    }

    function peekAtTooltipEnd() {
        tooltip.style({
            visibility: null,
            display: "none"
        });
    }
}


function InteractiveMap(_topology, _categories, _counties, 
    externalRegionClickHandler) {
    /******************
    *    constants    *
    ******************/
    var colorLowest = "#cce4ec",
        colorHighest = "#0078a1",
        tooltipXYSpacing = 8,
        legendItemCount = 5;
    
    
    /***************
    *    init()    *
    ***************/
    var topologyData = _topology,
        categoryData = _categories,
        countyData = _counties;

    var tooltipContainer = d3.select("#map-tooltip"),
        tooltipCountyName = d3.select("#map-tooltip .county"),
        tooltipDataName = d3.select("#map-tooltip .data .name"),
        tooltipDataValue = d3.select("#map-tooltip .data .value");
    
    var colorScale;

    var currentCategory = null,
        currentYear,
        currentCounty,
        currentCountyDomSelection,
        currentSelectedCounty = null;
    
    var alreadyDrawn = false,
        tooltipVisible = false;
    
    var mapContainer = d3.select("#map svg"),
        legendContainer = d3.select("#legend");

    var map = mapContainer.append("g");

    var counties,
        legend;

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
    };

    this.resize = function () {
        adjustScaleAndPosition();
    };

    
    /******************
    *    functions    *
    ******************/
    function paintMap(category, year, start, end) {        
        if (currentCategory !== category) {
            var data = [];
            var values = categoryData[category].values;
            
            for (var i = 0; i < values.length; i++) {
                for (var j = start; j <= end; j++) {
                    data.push(values[i][j]);
                }
            }

            colorScale = d3.scale.linear()
                .domain([
                    d3.min(data), 
                    d3.max(data)
                ])
                .range([colorLowest, colorHighest])
                .nice();
            
            if (currentCategory !== null) {
                legend.remove();
            }
            makeLegend();
            
            currentCategory = category;
        }

        counties.attr({
            fill: function(d, county) { 
                return colorScale(categoryData[category].values[county][year]);
            }
        });

        currentYear = year;
    }

    function makeLegend() {
        var domain = colorScale.domain();
        var max = domain[1];
        
        var range = d3.range(1, legendItemCount + 1);
        var values = [];
        
        for (var i = 0; i < legendItemCount; i++) {
            var value = range[i] / legendItemCount * max;
            var color = colorScale(value);
            values.push({
                value: value,
                color: color
            });
        }

        legend = legendContainer
            .selectAll(".item")
            .data(values)
            .enter()
            .append("p")
                .attr({
                    class: "item"
                });
        
        legend
            .append("span")
            .attr({
                class: "color"
            })
            .style({
                "background-color": function (d) { return d.color; }
            });
        
        legend
            .append("span")
            .attr({
                class: "value"
            })
            .html(function (d) { return d.value; });
    }

    function tryDrawMap() {
        if (!alreadyDrawn) {
            hideTooltip();

            drawMap();

            emitRegionChangedSignal();

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
        
        mapContainer.on("click", mapContainerClickHandler);
        
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
            left: x + tooltipXYSpacing + "px",
            top: y + tooltipXYSpacing + "px",
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
        var countyName = countyData[currentCounty].name,
            dataName = categoryData[currentCategory].tooltipText,
            dataValue = categoryData[currentCategory]
                .values[currentCounty][currentYear];

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
        var expectedX = mapContainerClientRect.width / 2 - 
                mapClientRect.width / 2;
        var diffX = expectedX - actualX;

        // map svg container starts from x = 0, so there is not much to 
        //  deal with. however, the starting y coordinate is a bit tricky 
        //  as above the map container is navbar. to compute the center y 
        //  coordinate, we need to factor in the navbar height.
        var actualAbsoluteY = mapClientRect.y;
        var actualRelativeY = actualAbsoluteY - mapContainerClientRect.y;
        var expectedRelativeY = mapContainerClientRect.height / 2 - 
                mapClientRect.height / 2;
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

        if (currentSelectedCounty === null) {
            domObjSelected.attr({
                id: "selected"
            });

            currentSelectedCounty = county;
            currentCountyDomSelection = domObjSelected;
            newRegionSelected = true;
        }
        else if (currentSelectedCounty !== county) {
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
            emitRegionChangedSignal();
    }

    function mapContainerClickHandler() {
        var mouseCurrentlyOnRegion = tooltipVisible;

        if (!mouseCurrentlyOnRegion && currentSelectedCounty !== null) {
            currentCountyDomSelection.attr({
                id: null
            });

            currentSelectedCounty = null;
            currentCountyDomSelection = null;

            emitRegionChangedSignal();
        }
    }

    function emitRegionChangedSignal() {
        externalRegionClickHandler(currentSelectedCounty);
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
    *    init()    *
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
    };

    this.resize = function () {
        windowResizeHandler();
    };

    
    /******************
    *    functions    *
    ******************/
    function windowResizeHandler() {
        mapClientRect = map.node().getBoundingClientRect();
        progressBarContainerClientRect = progressBarContainer
            .node()
            .getBoundingClientRect();
        
        progressBarAreaXEnd = 
            mapClientRect.x + mapClientRect.width - 
            progressBarContainerClientRect.x;

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
        if (currentYear !== year) {
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
        updateProgressLines();
    }

    function updateProgressLines() {
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
        progressBarLineRemainingXStart = currentX;
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
        if (currentYear === yearEnd && !animInterruptedByDrag)
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
            stopAnim();
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
}
