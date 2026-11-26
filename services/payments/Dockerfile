FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY pom.xml ./
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B package -DskipTests

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=build /build/target/payments-service.jar ./payments-service.jar
RUN adduser -S -H app
USER app
EXPOSE 8092
CMD ["java", "-jar", "payments-service.jar"]
