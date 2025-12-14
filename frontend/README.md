# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/cf28b9bc-eb75-49fd-b9b7-033893ae4394

## Project Structure

This project follows a well-organized architecture for maintainability and scalability:

### Directory Structure

```
src/
├── assets/              # Static assets (images, icons, fonts)
├── components/          # Reusable UI components
│   └── ui/             # shadcn-ui and custom UI components
│       ├── effects/    # Visual effects (glitch, animations)
│       ├── loaders/    # Loading indicators
│       └── progress/   # Progress bar components
├── constants/          # Application constants and configuration
│   ├── mockData.ts     # Mock data for development
│   ├── navigation.ts   # Navigation configuration
│   ├── processingStages.ts  # Token processing stages
│   └── validation.ts   # Form validation rules
├── hooks/              # Custom React hooks
│   ├── useTokenForm.ts       # Token form state management
│   └── useTokenProcessing.ts # Token processing state
├── pages/              # Page components (routes)
├── types/              # TypeScript type definitions
│   ├── token.ts        # Token-related types
│   └── profile.ts      # Profile-related types
└── lib/                # Utility functions

```

### Key Design Patterns

- **Component Organization**: Large components are broken down into smaller, focused sub-components
- **Custom Hooks**: Business logic is extracted into reusable custom hooks
- **Type Safety**: All data structures have proper TypeScript interfaces
- **Constants**: Magic numbers and configuration are centralized in constants files
- **Code Documentation**: All files include JSDoc comments explaining their purpose

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/cf28b9bc-eb75-49fd-b9b7-033893ae4394) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/cf28b9bc-eb75-49fd-b9b7-033893ae4394) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
