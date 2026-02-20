const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const email = 'natanael@kogna.co';

    const user = await prisma.user.findUnique({
        where: { email },
        include: { whatsappInstances: true }
    });

    if (!user) {
        console.log(`Usuário ${email} não encontrado.`);
        return;
    }

    console.log(`Usuário encontrado: ${user.name} (${user.id})`);
    console.log(`Instâncias atuais: ${user.whatsappInstances.length}`);

    if (user.whatsappInstances.length > 0) {
        const deleted = await prisma.whatsAppInstance.deleteMany({
            where: { userId: user.id }
        });
        console.log(`Sucesso! ${deleted.count} instâncias foram removidas.`);
    } else {
        console.log('O usuário já não possui instâncias conectadas.');
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
