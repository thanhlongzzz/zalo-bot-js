FROM node:20-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build TypeScript to JavaScript
RUN npm run build

# Port app will listen on (can be overridden by .env)
EXPOSE 5005

# Set default PORT env to 5005 for the app
ENV PORT=5005

# Run the production build
CMD ["node", "dist/production/index.js"]
