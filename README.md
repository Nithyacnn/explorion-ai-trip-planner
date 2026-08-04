# Explorion AI Planner

"Build an AI-powered travel planner web app named Explorion using a sleek, modern dark navy background (#0B132B or similar) with brass/gold accent buttons (#D4AF37) and off-white cards.

1. Home Page (Input Screen)

Header: Title 'Explorion - AI Travel Planner' with a logo placeholder.

Main Hero Section: Headline 'Where do you want to go?' and a text area input box: 'Describe your trip (e.g., 3 days in Goa under ₹20,000 in October)'.

Action Button: A primary gold button labeled 'Plan My Trip →'.

Quick-try chip buttons under the search bar: e.g., '3 days in Goa', '5 days in Coorg', 'Weekend in Pondicherry'. Clicking a chip fills the input box.

2. Output Screen (Trip Dashboard)

When 'Plan My Trip' is clicked, parse the input text and dynamically render the output dashboard with 3 main sections/tabs:

Card 1: Transport Estimates (Flight vs Train)

Show estimated round-trip price ranges to reach the destination.

Example: Train (SL/3A): ₹1,500 – ₹3,200 round-trip vs Flight: ₹5,500 – ₹9,000 round-trip.

Card 2: Day-by-Day Itinerary

Clean vertical timeline cards for Day 1, Day 2, Day 3 with morning, afternoon, and evening activity tags.

Card 3: Itemized Budget Breakdown

Split total budget into: Stay, Transit, Meals, Activities.

Simple progress bars showing percentage allocated.

3. Logic & State Management

Store the user prompt in state.

Include mock dynamic calculation logic (or connect to Gemini/OpenAI API) so changing the prompt (e.g., switching from 'Goa' to 'Manali') instantly updates the destination title, flight/train price ranges, itinerary days, and budget numbers across the dashboard!"

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://explorion-ai-trip-planner.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/cf6d7eaf-26f5-4fa1-9af2-c44fd74e1a54).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
