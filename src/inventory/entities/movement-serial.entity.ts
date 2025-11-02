import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, Unique, Index } from 'typeorm';
import { Movement } from './movement.entity';
import { Serial } from './serial.entity';

@Entity('movement_serials')
@Unique(['movementId', 'serialId'])
@Index(['movementId'])
export class MovementSerial {
    @PrimaryGeneratedColumn() id: number;

    @ManyToOne(() => Movement, { onDelete: 'CASCADE' })
    movement: Movement;

    @Column()
    movementId: number;

    @ManyToOne(() => Serial, { eager: true, onDelete: 'CASCADE' })
    serial: Serial;

    @Column()
    serialId: number;

    @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
    linkedAt: Date;
}
