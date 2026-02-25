# Safe Map - Hackathon Project

This is a React Native mobile application built with Expo and Mapbox.

## Prerequisites

1.  **Mapbox Account**: You need a Mapbox account and a public access token.
2.  **Secret Token**: For building the app (iOS/Android), you need a secret token with `DOWNLOADS:READ` scope.

## Setup

1.  **Environment Variables**:
    Create a `.env` file in the root directory:
    ```bash
    EXPO_PUBLIC_MAPBOX_TOKEN=pk.eyJ1... (Your public token)
    ```

2.  **SDK Download Token**:
    Mapbox SDK requires a secret token to download the binaries.
    
    *Mac/Linux*:
    Add the following to your `~/.netrc` file (create it if it doesn't exist):
    ```
    machine api.mapbox.com
      login mapbox
      password sk.eyJ1IjoiYXRoYXJ2NzE0IiwiYSI6ImNtbHR0dXhxODAwM3Uza3NpaXp1NGVxYWEifQ.B5pYrvl8pmBRI2JdIlNFBQ (Your secret token with DOWNLOADS:READ scope)
    ```
    Change permissions: `chmod 600 ~/.netrc`

3.  **Install Dependencies**:
    ```bash
    npm install
    ```

4.  **Run the App**:
    Since this uses Native Modules (Mapbox), you cannot use Expo Go. You must use a Development Build.
    
    **iOS**:
    ```bash
    npx expo run:ios
    ```
    
    **Android**:
    ```bash
    npx expo run:android
    ```

## Features

-   **Map Interface**: Full-screen Mapbox map.
-   **Search**: Search for places using Mapbox Geocoding.
-   **Navigation**:
    -   Select a place to see the **Overview** (Route & Distance).
    -   Click "Start Navigation" to enter **Turn-by-Turn** mode.
    -   Camera tracks your location with course.
    -   Instructions update as you move (simulated distance check).

## Tech Stack

-   **React Native** (Expo SDK 54)
-   **@rnmapbox/maps** (v11)
-   **Expo Location**
