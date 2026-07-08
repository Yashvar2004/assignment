# HubSpot Sync - Frontend

React frontend for the HubSpot Sync application, built with Vite, TypeScript, and Tailwind CSS.

## Tech Stack

- **React 18** - UI library
- **Vite** - Build tool and dev server
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first CSS
- **React Router** - Client-side routing
- **Axios** - HTTP client
- **React Hot Toast** - Toast notifications

## Getting Started

### Prerequisites

- Node.js 18+
- Backend server running on http://localhost:3001

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will be available at http://localhost:5173

### Build

```bash
npm run build
```

### Deployment (Vercel)

1. Push to GitHub
2. Connect repository to Vercel
3. Set environment variable: `VITE_API_URL` = your backend URL
4. Deploy

## Project Structure

```
src/
├── components/        # React components
│   ├── ConnectButton  # HubSpot connect UI
│   ├── ContactList    # Contacts table with search/pagination
│   ├── ContactDetail  # Contact info with notes
│   ├── Header         # Navigation header
│   └── SyncStatus     # Sync job monitoring
├── context/
│   └── AuthContext    # Authentication state management
├── pages/
│   └── AuthCallback   # OAuth callback handler
├── services/
│   └── api.ts         # API client with Axios
├── types/
│   └── index.ts       # TypeScript interfaces
└── App.tsx            # Main app with routing
```

## Features

- OAuth connection to HubSpot
- Automatic contact sync after connection
- Contact list with search and pagination
- Contact detail view with notes
- Note creation with automatic HubSpot sync
- Real-time sync status monitoring
- Responsive design
