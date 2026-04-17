import bcrypt from 'bcrypt';

const salt = 10;

const hashPassword = async (password) => {
    return await bcrypt.hash(password, salt);
}

const comparePassword = async (password, hash) => {
    return await bcrypt.compare(password, hash);
}

export { hashPassword, comparePassword };