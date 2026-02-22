FROM node:22.17.1-slim

# Install Chromium and required fonts/dependencies
RUN apt-get update \
    && apt-get install -y chromium fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to skip downloading Chrome and use the system Chromium we just installed
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Set the working directory inside the container
WORKDIR /app

# Copy the package files first to leverage Docker layer caching
COPY package*.json ./

# Install dependencies strictly from the package-lock.json
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the NestJS application
RUN npm run build

# Start the compiled application
CMD ["node", "dist/main"]