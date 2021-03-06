import { HttpException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { LoginReqDto, LoginResDto } from "src/security/security-dto";
import { IAuthResponse } from "src/security/auth.interface";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserEntity } from "src/user/entity/user.entity";
import { CustomLogger } from "src/common/logger/custom-logger.service";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { RedisService } from "nestjs-redis";
import { ConfigService } from "src/configuration/config.service";


@Injectable()
export class SecurityService {

    private redisClient = null;
    constructor(
        @InjectRepository(UserEntity)
        private readonly userRepository: Repository<UserEntity>,
        private readonly logger: CustomLogger,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly redisService: RedisService
    ) {
        this.logger.setContext('UserService');
        this.redisClient = this.redisService.getClient(ConfigService.PROPERTIES.redis.name);
    }

    async login(loginDto: LoginReqDto): Promise<IAuthResponse> {



        let user: UserEntity = await this.userRepository.findOne({ where: { email: loginDto.email } });

        if (user == null) {
            throw new NotFoundException("User doesn't exist")
        }

        if (!user.isActive || user.isAccountLocked) {
            throw new UnauthorizedException(" User account is locked or deactivated. Please contact support");
        }


        let isPasswordMatched: boolean = await argon2.verify(user.password, loginDto.password);
        if (isPasswordMatched) {
            let permissionList = []
            user.roles.forEach(role => {
                role.permissions.forEach(permission => {
                    permissionList.push(permission.value);
                })
            })
            let payload = { "email": user.email, "user": { "id": user.id, "firstName": user.firstName, "isActive": user.isActive, "isAccountLocked": user.isAccountLocked, "permissions": permissionList } };
            const accessToken = this.jwtService.sign(payload, { expiresIn: '2d', subject: user.email, algorithm: "HS512", "secret": 'secret12356789' });
            let authResponse: LoginResDto = new LoginResDto();
            authResponse.email = user.email;
            authResponse.token = accessToken;


            this.redisClient.set(user.email, authResponse.token, 'EX', 3600);
            return authResponse;
        } else {
            throw new UnauthorizedException("Credentials are wrong. Kindly try again with right email and password.");
        }
    }

}