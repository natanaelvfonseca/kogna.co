import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const email = 'pugthetruth@gmail.com';

    try {
        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            console.log(`User with email ${email} not found.`);
            return;
        }

        console.log(`Found user: ${user.id}. Deleting...`);

        await prisma.user.delete({
            where: { email },
        });

        console.log(`Successfully deleted user ${email}`);
    } catch (error) {
        console.error(`Failed to delete user:`, error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
