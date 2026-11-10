FROM node:20-alpine

WORKDIR /app

# Installation des dépendances
COPY package*.json ./
RUN npm install

# Copie du code
COPY . .

# Build de l'application
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Exposition du port 5100
EXPOSE 5100

# Commande de démarrage
CMD ["npm", "run", "start"]
