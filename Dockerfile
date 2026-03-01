# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# VITE_ variables must be available at build time
ARG VITE_OPENAI_API_KEY
ARG VITE_MARGINBITES_APP_ID
ARG VITE_MARGINBITES_APP_BASE_URL
ARG VITE_MARGINBITES_FUNCTIONS_VERSION

ENV VITE_OPENAI_API_KEY=$VITE_OPENAI_API_KEY
ENV VITE_MARGINBITES_APP_ID=$VITE_MARGINBITES_APP_ID
ENV VITE_MARGINBITES_APP_BASE_URL=$VITE_MARGINBITES_APP_BASE_URL
ENV VITE_MARGINBITES_FUNCTIONS_VERSION=$VITE_MARGINBITES_FUNCTIONS_VERSION

RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
