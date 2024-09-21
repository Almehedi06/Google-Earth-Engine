# Google-Earth-Engine

![Open in Colab](https://colab.research.google.com/assets/colab-badge.svg)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6%2B-yellow)
![Google Earth Engine](https://img.shields.io/badge/Google%20Earth%20Engine-Enabled-green)
![Machine Learning](https://img.shields.io/badge/Machine%20Learning-Enabled-orange)
![License](https://img.shields.io/badge/license-MIT-green)
![Issues](https://img.shields.io/github/issues/yourusername/Google-Earth-Engine)

A collection of Google Earth Engine (GEE) **JavaScript** scripts for **flood mapping** and **land cover classification** using satellite data from Sentinel-1, Sentinel-2, and Landsat.

---

### Connect with Me:

[![Twitter Badge](https://img.shields.io/badge/Twitter-@AlMehedi06-1DA1F2?style=flat&logo=twitter&logoColor=white)](https://x.com/AlMehedi06)
[![LinkedIn Badge](https://img.shields.io/badge/LinkedIn-Md--Abdullah--Al--Mehedi-blue?style=flat&logo=linkedin)](https://www.linkedin.com/in/md-abdullah-al-mehedi/)
[![ResearchGate Badge](https://img.shields.io/badge/ResearchGate-Md--Abdullah--Al--Mehedi-brightgreen?style=flat&logo=researchgate)](https://www.researchgate.net/profile/Md-Abdullah-Al-Mehedi)
[![Personal Website](https://img.shields.io/badge/Website-Abdullah--Al--Mehedi-blue?style=flat&logo=google-chrome)](https://almehedi06.wixsite.com/abdullah-al-mehedi)
[![Google Scholar Badge](https://img.shields.io/badge/Google%20Scholar-Citations-blue?style=flat&logo=google-scholar)](https://scholar.google.com/citations?user=4DR2F4kAAAAJ&hl=en)

---

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Technologies](#technologies)
3. [Data Sources](#data-sources)
4. [Installation](#installation)
5. [Usage](#usage)
6. [Examples](#examples)
7. [Contributing](#contributing)
8. [License](#license)

---

## Project Overview

This project leverages **Google Earth Engine (GEE)** and **JavaScript** for large-scale geospatial data analysis, including:
- **Flood Mapping**: Using **Sentinel-1 SAR** data to detect and map flood-affected areas.
- **Land Cover Classification**: Using **Sentinel-2 multispectral** data to classify land cover (e.g., urban, forest, water, agriculture).
- **Machine Learning**: Applied using Random Forest for flood detection and classification.

The repository contains scripts for:
- **Preprocessing SAR data**: Speckle filtering, band extraction, and standardization.
- **Flood detection**: Using time-series SAR data and threshold-based classification.
- **Land cover classification**: Using Sentinel-2's NDVI and Random Forest models.
- **Accuracy assessment**: Precision, Recall, and F1-score for model evaluation.

---

## Technologies

The project utilizes the following technologies:
- **Google Earth Engine (GEE)**: Cloud-based platform for geospatial data analysis.
- **JavaScript**: The primary language for scripting in the GEE platform.
- **Machine Learning**: Implemented using GEE's **Random Forest** classifier for flood detection.
- **Sentinel-1**: Used for flood mapping due to its Synthetic Aperture Radar (SAR) capabilities.
- **Sentinel-2**: Used for land cover classification based on NDVI calculations.
- **HydroSHEDS**: Used for slope data analysis to mask out steep areas.

---

## Data Sources

The scripts use satellite imagery from:
- **Sentinel-1 SAR Data**: Ideal for flood mapping due to its ability to capture data during all weather conditions, including heavy cloud cover.
- **Sentinel-2 Multispectral Data**: Provides high-resolution imagery for land cover classification and NDVI calculations.
- **HydroSHEDS DEM**: Used for topography and slope analysis in flood detection.

---

## Installation

To use the code in this repository:

1. **Access Google Earth Engine**:
   - Ensure you have a **Google Earth Engine account**. Sign up [here](https://earthengine.google.com/).
   
2. **Run the Scripts in GEE**:
   - All scripts are written in **JavaScript** and can be directly copied into the **Google Earth Engine Code Editor**.
   - Access the Code Editor [here](https://code.earthengine.google.com/).

---

## Usage

1. **Flood Mapping Using Sentinel-1**:
   - Load and preprocess **Sentinel-1 SAR data**.
   - Apply **speckle filtering** to reduce noise using the Refined Lee filter.
   - Calculate **flood areas** using division between dry and wet periods, followed by **thresholding**.
   - Mask out permanent water bodies and steep areas using **HydroSHEDS** slope data.
   
2. **Land Cover Classification Using Sentinel-2**:
   - Apply cloud masking to **Sentinel-2** data.
   - Calculate **NDVI** using bands B8 and B4.
   - Combine NDVI and additional features like **elevation** and **slope** for classification.
   
3. **Machine Learning for Flood Detection**:
   - Train a **Random Forest** classifier on flood and non-flood areas.
   - Use features such as VV, VH, slope, elevation, and NDVI for model input.
   - Evaluate model performance using **Precision, Recall, and F1-score**.

4. **Accuracy Assessment**:
   - Calculate **Precision, Recall, and F1-score** for the model using predicted and actual flooded areas.
   
---

## Examples

### 1. Flood Mapping Using Sentinel-1 SAR:
   The script `flood_mapping.js` demonstrates:
   - Loading **Sentinel-1 SAR data**.
   - Preprocessing the data with **speckle filtering**.
   - Detecting flood areas using **division** between dry and flood periods.

### 2. Land Cover Classification Using Sentinel-2:
   The script `land_cover_classification.js` demonstrates:
   - Cloud masking for **Sentinel-2** data.
   - **NDVI** calculation and combination with slope and elevation data.
   - Training a **Random Forest** model for land cover classification.

### 3. Machine Learning for Flood Detection:
   The script `ml_flood_detection.js` demonstrates:
   - Training a **Random Forest** model for flood detection.
   - Evaluating the model with **Precision, Recall, and F1-score** metrics.
   - Using **connected pixel count** to clean the flood detection results.

---

## Contributing

Contributions are welcome! Please follow these steps:
1. Fork the repository.
2. Create a new branch (`git checkout -b feature-branch`).
3. Make your changes and commit (`git commit -am 'Add new feature'`).
4. Push to the branch (`git push origin feature-branch`).
5. Create a new Pull Request.

---

## License

This repository is licensed under the MIT License. See the [LICENSE](LICENSE.md) file for details.
