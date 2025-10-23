// --- 1. CONFIGURATION AND AOI ---
// This script creates a Sentinel-2 image availability calendar for the Nairobi AOI.

// Constants
var S2_COLLECTION = 'COPERNICUS/S2_SR_HARMONIZED';
var AOI_ASSET_PATH = 'projects/ee-celestakim019/assets/NAIROBI';
var VIS_PARAMS = {
  min: 0,
  max: 3000,
  bands: ['B4', 'B3', 'B2'] // True Color
};

// Load Area of Interest (AOI) and center the map.
var aoi = ee.FeatureCollection(AOI_ASSET_PATH);
Map.centerObject(aoi, 10);

// Client-side variable to store dates found during the GEE query
var availableDates = {};
var currentSelection = null;

// --- 2. UI SETUP ---

// Main control panel
var controlPanel = ui.Panel({
  style: {width: '350px', padding: '10px'},
  layout: ui.Panel.Layout.flow('vertical')
});
ui.root.insert(0, controlPanel);

// Title
controlPanel.add(ui.Label('Sentinel-2 Availability Calendar', {
  fontWeight: 'bold',
  fontSize: '18px',
  color: '4a00e0' // Indigo shade
}));

// Year Selector
var yearSelector = ui.Select({
  items: ['2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017'],
  placeholder: 'Select Year',
  value: '2022',
  style: {stretch: 'horizontal'}
});

// Cloud Cover Slider
var cloudLabel = ui.Label('Max Cloud Cover: 10%', {margin: '8px 0 4px 0'});
var cloudSlider = ui.Slider({
  min: 0,
  max: 100,
  value: 10,
  step: 5,
  style: {stretch: 'horizontal'}
});
cloudSlider.onChange(function(value) {
  cloudLabel.setValue('Max Cloud Cover: ' + value + '%');
});

// Load Button
var loadButton = ui.Button({
  label: 'Load Image Availability',
  style: {stretch: 'horizontal', color: 'white', backgroundColor: '4a00e0'}
});

// Status Label
var statusLabel = ui.Label('Click "Load" to fetch data for the selected year.', {
  padding: '8px',
  border: '1px solid #ddd',
  color: '444',
  stretch: 'horizontal'
});

// Use flow('horizontal') for the main calendar container to allow 3 months per row to wrap naturally.
var calendarPanel = ui.Panel({
  layout: ui.Panel.Layout.flow('horizontal'), 
  style: {margin: '10px 0', stretch: 'horizontal'}
});

// Add all UI components to the control panel
controlPanel.add(yearSelector);
controlPanel.add(cloudLabel);
controlPanel.add(cloudSlider);
controlPanel.add(loadButton);
controlPanel.add(statusLabel);
controlPanel.add(ui.Label('Calendar View (3 Months per Row)', {fontWeight: 'bold', margin: '15px 0 5px 0'}));
controlPanel.add(calendarPanel);


// --- 3. GEE DATA FETCHING LOGIC ---

/**
 * Filters the S2 collection and requests all unique available dates from the server.
 */
function updateAvailability() {
  var year = yearSelector.getValue();
  var maxCloud = cloudSlider.getValue();

  if (!year) {
    statusLabel.setValue('Please select a year.');
    return;
  }

  statusLabel.setValue('Fetching dates for ' + year + ' with < ' + maxCloud + '% cloud cover...');
  loadButton.setDisabled(true);

  var startDate = ee.Date.fromYMD(ee.Number.parse(year), 1, 1);
  var endDate = startDate.advance(1, 'year');

  var collection = ee.ImageCollection(S2_COLLECTION)
      .filterBounds(aoi.geometry())
      .filterDate(startDate, endDate)
      .filter(ee.Filter.lt('CLOUD_COVERAGE_ASSESSMENT', maxCloud));

  // Map to get the standardized date string (YYYY-MM-DD)
  var dateList = collection
      .map(function(image) {
        return image.set('date_key', ee.Date(image.get('system:time_start')).format('YYYY-MM-dd'));
      })
      .aggregate_array('date_key');

  // Execute on the server and get results back to the client
  dateList.evaluate(function(dates) {
    
    // Clear previous data
    availableDates = {};
    
    if (!dates || dates.length === 0) {
      statusLabel.setValue('No scenes found for ' + year + ' with < ' + maxCloud + '% cloud cover.');
      loadButton.setDisabled(false);
      calendarPanel.clear();
      return;
    }

    // Populate availableDates map with unique dates (UNIVERSALLY COMPATIBLE METHOD)
    var uniqueDates = {};
    dates.forEach(function(d) {
      uniqueDates[d] = true;
    });
    availableDates = uniqueDates;

    renderCalendar(parseInt(year));
    loadButton.setDisabled(false);
    statusLabel.setValue(Object.keys(availableDates).length + ' unique days available. Click a green day to view.');
  });
}
loadButton.onClick(updateAvailability);


// --- 4. CALENDAR RENDERING ---

var MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];
var DAY_NAMES = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // Shortened day names for compact grid

/**
 * Creates and displays the calendar grid based on availableDates.
 * @param {number} year The selected year.
 */
function renderCalendar(year) {
  calendarPanel.clear();

  for (var month = 0; month < 12; month++) {
    var date = new Date(year, month, 1);
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Month Container: Uses flow('vertical') for internal elements, 
    // and fixed width to enable 3-column wrap in the parent calendarPanel.
    var monthContainer = ui.Panel({
      layout: ui.Panel.Layout.flow('vertical'),
      style: {border: '1px solid #ccc', margin: '4px', padding: '5px', width: '31%'}
    });
    
    // Month Title
    monthContainer.add(ui.Label(MONTH_NAMES[month] + ' ' + year, {
      fontWeight: 'bold',
      fontSize: '12px',
      textAlign: 'center',
      margin: '0 0 2px 0',
      color: '4a00e0'
    }));

    // Day Headers (Mon-Sun): Use flow('horizontal') for a row of equally spaced elements.
    var headerPanel = ui.Panel({
      layout: ui.Panel.Layout.flow('horizontal'),
      style: {stretch: 'horizontal', margin: '0 0 2px 0'}
    });
    
    // Fixed width used for compatibility to ensure equal distribution.
    DAY_NAMES.forEach(function(dayName) {
      headerPanel.add(ui.Label(dayName, {
        fontSize: '9px',
        textAlign: 'center',
        fontWeight: 'bold',
        color: '#6b7280',
        width: '14%' 
      }));
    });
    monthContainer.add(headerPanel);
    
    // Day Grid: Use flow('horizontal') to let day boxes wrap into 7 columns implicitly.
    var gridPanel = ui.Panel({
      layout: ui.Panel.Layout.flow('horizontal'),
      style: {stretch: 'horizontal'}
    });

    // Calculate the day of the week for the 1st of the month (Monday-start)
    // 0=Sun, 1=Mon, ..., 6=Sat. We convert to 0=Mon, ..., 6=Sun.
    var firstDayOfWeek = (date.getDay() + 6) % 7; 
    
    // Add empty boxes for offset
    for (var i = 0; i < firstDayOfWeek; i++) {
      // Use fixed width/minWidth for proper alignment
      gridPanel.add(ui.Label('', {height: '18px', minWidth: '18px', margin: '1px'}));
    }

    // Populate day boxes
    for (var day = 1; day <= daysInMonth; day++) {
      var dateKey = year + '-' + ('0' + (month + 1)).slice(-2) + '-' + ('0' + day).slice(-2);
      var isAvailable = availableDates[dateKey];
      
      // --- FIX: Using ui.Button for robust onClick support ---
      var dayButton = ui.Button({
        label: day.toString(),
        // Style the button to look like a small calendar box
        style: {
          fontSize: '10px',
          textAlign: 'center',
          height: '18px',
          minWidth: '18px',
          padding: '1px',
          margin: '1px',
          borderRadius: '2px',
          width: '14%', 
          fontWeight: 'normal', // Ensure it doesn't look like a standard bold button
          backgroundColor: isAvailable ? '059669' : 'f3f4f6', 
          color: isAvailable ? 'white' : '6b7280',
          border: isAvailable ? '1px solid #059669' : '1px solid #ccc',
        },
        onClick: null // Will be set only if isAvailable is true
      });
      // --------------------------------------------------------

      if (isAvailable) {
        // Attach click listener to the button
        dayButton.onClick(createDisplayImageHandler(dateKey, dayButton));
      } else {
        // Disable the button and remove the pointer to make it look non-clickable
        dayButton.setDisabled(true);
      }
      
      gridPanel.add(dayButton);
    }
    
    monthContainer.add(gridPanel);
    calendarPanel.add(monthContainer);
  }
}

// --- 5. IMAGE DISPLAY HANDLER ---

/**
 * Creates a click handler function to display the best image for the selected day.
 * @param {string} dateKey The date string (YYYY-MM-DD).
 * @param {ee.ui.Button} dayButton The button element that was clicked.
 * @return {Function} The function to be executed on click.
 */
function createDisplayImageHandler(dateKey, dayButton) {
  return function() {
    // Visual feedback: clear previous selection, highlight current
    if (currentSelection) {
      // Revert the previous selection's border style
      // The currentSelection must be an available day (green box)
      currentSelection.style().set('border', '1px solid #059669'); 
    }
    dayButton.style().set('border', '2px solid #4a00e0'); // Indigo border for selection
    currentSelection = dayButton;
    
    statusLabel.setValue('Loading image for ' + dateKey + '...');
    
    // Clear the map layers, only leaving the base map
    Map.layers().reset();
    
    var maxCloud = cloudSlider.getValue();
    var startDate = ee.Date(dateKey);
    var endDate = startDate.advance(1, 'day');

    // Filter collection for the day, sort by cloud cover, and get the best image
    var collection = ee.ImageCollection(S2_COLLECTION)
        .filterBounds(aoi.geometry())
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUD_COVERAGE_ASSESSMENT', maxCloud))
        .sort('CLOUD_COVERAGE_ASSESSMENT'); 

    // Get the first (least cloudy) image
    var image = collection.first();

    // The image must be evaluated to ensure it exists and to get its cloud property
    image.getInfo(function(info) {
      if (!info) {
        statusLabel.setValue('Error: Image not found for ' + dateKey + ' matching current criteria.');
        // Revert selection highlight if load failed
        dayButton.style().set('border', '1px solid #059669');
        currentSelection = null;
        return;
      }
      
      // Clip the image to the AOI and add it to the map
      Map.addLayer(image.clip(aoi.geometry()), VIS_PARAMS, 'S2 True Color ' + dateKey);
      
      statusLabel.setValue('Successfully displayed image for: ' + dateKey + ' (Cloud Cover: ' + info.properties.CLOUD_COVERAGE_ASSESSMENT.toFixed(1) + '%)');
    });
  };
}
