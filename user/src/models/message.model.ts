import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'Message' })
export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  sender: string;

  @Column()
  recipient: string;

  @Column()
  message:string

  @Column()
  timestamp: Date;
}