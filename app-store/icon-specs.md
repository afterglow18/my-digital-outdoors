# App Icon Specifications

## What Apple Requires

Since iOS 18, only **one icon size** is submitted: **1024 × 1024 px PNG**.
Xcode automatically generates all required sizes from this single source.

## Requirements

- **Size:** 1024 × 1024 pixels
- **Format:** PNG (no transparency, no alpha channel — Apple rejects transparent icons)
- **Color space:** sRGB
- **Rounded corners:** Do NOT round the corners yourself — Apple masks them automatically
- **No border / stroke around the edge**
- **No text that replicates the app name** (Apple guideline, not enforced but recommended)

## Design Suggestions for My Digital Outdoors

**Concept ideas:**
- A minimalist coat hanger on the cream `#FFFDF7` background with a yellow heart
- A dress form / mannequin silhouette in black on cream
- A stylized wardrobe door slightly ajar, revealing a colorful closet
- The letter M formed from hangers

**Brand colors:**
- Cream: `#FFFDF7`
- Black: `#1A1A1A`
- Yellow accent: `#F5C842`
- Soft border: `#D4C5A9`

## Where to Create Your Icon

**Free tools:**
- [Figma](https://figma.com) — design at 1024×1024, export as PNG
- [Canva](https://canva.com) — search "App Icon" template
- [Sketch](https://sketch.com) — if you have a Mac

**AI-generated icons:**
- [Midjourney](https://midjourney.com) — prompt: "minimal app icon, coat hanger, cream background, black line art, no text, flat design, 1024x1024"
- [Adobe Firefly](https://firefly.adobe.com)

## How to Add the Icon to the Xcode Project

1. Open `artifacts/outfit-generator/ios/App/App.xcworkspace` in Xcode
2. In the project navigator, click `App` → `Assets.xcassets` → `AppIcon`
3. Drag your 1024×1024 PNG onto the "App Store" slot
4. Xcode auto-generates all other sizes

## Where to Place the File Now (for Codemagic)

Save your final icon as:
```
app-store/AppIcon-1024.png
```

The Codemagic build pipeline will need a script step to copy it into the Xcode asset catalog,
or you can commit the generated `Assets.xcassets/AppIcon.appiconset/` folder directly after
running `cap add ios` on a Mac.
