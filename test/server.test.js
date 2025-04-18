const request = require("supertest");
const app = require("../server");

describe("Тесты сервера", () => {
    test("GET /games возвращает 200", async () => {
        const response = await request(app).get("/games");
        expect(response.statusCode).toBe(200);
    });

    test("POST /rate/game1 обновляет рейтинг", async () => {
        const response = await request(app)
            .post("/rate/game1")
            .send({ rating: 5 });
        expect(response.body.success).toBe(true);
    });
});