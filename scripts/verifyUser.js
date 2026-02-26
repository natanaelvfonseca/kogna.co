import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const email = 'pugthetruth@gmail.com';

    const user = await prisma.user.findUnique({
        where: { email },
    });

    if (!user) {
        console.log(`CONFIRMED: User with email ${email} does not exist.`);
        return;
    }

    console.log(`STILL EXISTS: Found user: ${user.id}.`);
    await prisma.$disconnect();
}

main().catch(console.error);
